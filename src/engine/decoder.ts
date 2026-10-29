import type { RecorderAPI } from '../../shared/api';

/**
 * Sequential WebCodecs decoding for export. Seeking an <video> element per output frame re-decodes from the
 * previous keyframe every time and, in a hidden or background window, can hand the canvas a stale frame.
 * Decoding the MP4 samples in order is both much faster and frame-exact.
 */
interface Track { codec: string; description?: Uint8Array; width: number; height: number; offsets: Float64Array; sizes: Uint32Array; pts: Float64Array; keys: Uint8Array }
type Reader = (offset: number, length: number) => Promise<Uint8Array>;

function boxes(data: DataView, start: number, end: number) {
  const result: { type: string; start: number; end: number; body: number }[] = [];
  for (let at = start; at + 8 <= end;) {
    let size = data.getUint32(at), body = at + 8;
    const type = String.fromCharCode(data.getUint8(at + 4), data.getUint8(at + 5), data.getUint8(at + 6), data.getUint8(at + 7));
    if (size === 1) { size = Number(data.getBigUint64(at + 8)); body = at + 16; } else if (size === 0) size = end - at;
    if (size < 8 || at + size > end) break;
    result.push({ type, start: at, end: at + size, body }); at += size;
  }
  return result;
}
const child = (data: DataView, parent: { body: number; end: number }, type: string) => boxes(data, parent.body, parent.end).find(box => box.type === type);
const path = (data: DataView, parent: { body: number; end: number } | undefined, ...types: string[]) => { let box = parent; for (const type of types) box = box && child(data, box, type); return box; };
const hex = (value: number) => value.toString(16).padStart(2, '0');

function hevcCodec(type: string, c: Uint8Array) {
  const space = ['', 'A', 'B', 'C'][c[1] >> 6], tier = c[1] & 0x20 ? 'H' : 'L', profile = c[1] & 0x1f;
  let compat = (c[2] << 24 | c[3] << 16 | c[4] << 8 | c[5]) >>> 0, reversed = 0;
  for (let bit = 0; bit < 32; bit++) { reversed = (reversed << 1 | compat & 1) >>> 0; compat >>>= 1; }
  const constraints = Array.from(c.slice(6, 12)); while (constraints.length > 1 && constraints.at(-1) === 0) constraints.pop();
  return `${type}.${space}${profile}.${reversed.toString(16)}.${tier}${c[12]}${constraints.map(value => `.${value.toString(16)}`).join('')}`;
}

export async function demux(read: Reader, size: number): Promise<Track> {
  let moov: Uint8Array | undefined;
  for (let at = 0; at + 8 <= size;) {
    const head = new DataView((await read(at, 16)).buffer);
    let length = head.getUint32(0); const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
    if (length === 1) length = Number(head.getBigUint64(8)); else if (length === 0) length = size - at;
    if (length < 8) throw new Error('Invalid MP4 box');
    if (type === 'moov') { if (length > 256 * 1024 * 1024) throw new Error('MP4 index is too large'); moov = await read(at, length); break; }
    if (type === 'moof') throw new Error('Fragmented MP4 is not supported');
    at += length;
  }
  if (!moov) throw new Error('MP4 index (moov) not found');
  const data = new DataView(moov.buffer, moov.byteOffset, moov.byteLength), root = { body: 8, end: moov.byteLength };
  for (const trak of boxes(data, root.body, root.end).filter(box => box.type === 'trak')) {
    const hdlr = path(data, trak, 'mdia', 'hdlr');
    if (!hdlr || String.fromCharCode(...moov.slice(hdlr.body + 8, hdlr.body + 12)) !== 'vide') continue;
    const mdhd = path(data, trak, 'mdia', 'mdhd')!, version = data.getUint8(mdhd.body);
    const timescale = data.getUint32(mdhd.body + (version === 1 ? 20 : 12));
    const stbl = path(data, trak, 'mdia', 'minf', 'stbl'); const stsd = stbl && child(data, stbl, 'stsd');
    if (!stbl || !stsd) continue;
    const entry = boxes(data, stsd.body + 8, stsd.end)[0]; if (!entry) continue;
    const width = data.getUint16(entry.body + 24), height = data.getUint16(entry.body + 26);
    const config = boxes(data, entry.body + 78, entry.end);
    let codec: string, description: Uint8Array | undefined;
    const avcC = config.find(box => box.type === 'avcC'), hvcC = config.find(box => box.type === 'hvcC');
    if (['avc1', 'avc3'].includes(entry.type) && avcC) { description = moov.slice(avcC.body, avcC.end); codec = `${entry.type}.${hex(description[1])}${hex(description[2])}${hex(description[3])}`; }
    else if (['hvc1', 'hev1'].includes(entry.type) && hvcC) { description = moov.slice(hvcC.body, hvcC.end); codec = hevcCodec(entry.type, description); }
    else throw new Error(`Unsupported video codec ${entry.type}`);
    // Sample tables.
    const table = (type: string) => child(data, stbl, type);
    const stsz = table('stsz')!, stts = table('stts')!, stsc = table('stsc')!, stco = table('stco') ?? table('co64')!, ctts = table('ctts'), stss = table('stss');
    if (!stsz || !stts || !stsc || !stco) throw new Error('Incomplete MP4 sample table');
    const fixed = data.getUint32(stsz.body + 4), count = data.getUint32(stsz.body + 8);
    const sizes = new Uint32Array(count); for (let i = 0; i < count; i++) sizes[i] = fixed || data.getUint32(stsz.body + 12 + i * 4);
    const dts = new Float64Array(count);
    for (let i = 0, n = data.getUint32(stts.body + 4), sample = 0, time = 0; i < n; i++) {
      const runs = data.getUint32(stts.body + 8 + i * 8), delta = data.getUint32(stts.body + 12 + i * 8);
      for (let k = 0; k < runs && sample < count; k++) { dts[sample++] = time; time += delta; }
    }
    const pts = Float64Array.from(dts);
    if (ctts) {
      const ver = data.getUint8(ctts.body);
      for (let i = 0, n = data.getUint32(ctts.body + 4), sample = 0; i < n; i++) {
        const runs = data.getUint32(ctts.body + 8 + i * 8), offset = ver === 1 ? data.getInt32(ctts.body + 12 + i * 8) : data.getUint32(ctts.body + 12 + i * 8);
        for (let k = 0; k < runs && sample < count; k++) pts[sample++] += offset;
      }
    }
    const chunkCount = data.getUint32(stco.body + 4), chunkOffsets = new Float64Array(chunkCount);
    for (let i = 0; i < chunkCount; i++) chunkOffsets[i] = stco.type === 'co64' ? Number(data.getBigUint64(stco.body + 8 + i * 8)) : data.getUint32(stco.body + 8 + i * 4);
    const offsets = new Float64Array(count), entries = data.getUint32(stsc.body + 4);
    for (let e = 0, sample = 0; e < entries; e++) {
      const first = data.getUint32(stsc.body + 8 + e * 12) - 1, perChunk = data.getUint32(stsc.body + 12 + e * 12);
      const last = e + 1 < entries ? data.getUint32(stsc.body + 8 + (e + 1) * 12) - 1 : chunkCount;
      for (let chunk = first; chunk < last; chunk++) for (let k = 0, at = chunkOffsets[chunk]; k < perChunk && sample < count; k++) { offsets[sample] = at; at += sizes[sample++]; }
    }
    const keys = new Uint8Array(count);
    if (stss) for (let i = 0, n = data.getUint32(stss.body + 4); i < n; i++) keys[data.getUint32(stss.body + 8 + i * 4) - 1] = 1; else keys.fill(1);
    // Edit list: the presentation starts at media_time (B-frame delay) after any initial empty edit.
    let shift = 0; const elst = path(data, trak, 'edts', 'elst');
    if (elst) {
      const ver = data.getUint8(elst.body), n = data.getUint32(elst.body + 4), movieScale = data.getUint32(path(data, root, 'mvhd')!.body + (data.getUint8(path(data, root, 'mvhd')!.body) === 1 ? 20 : 12));
      for (let i = 0, at = elst.body + 8; i < n; i++, at += ver === 1 ? 20 : 12) {
        const duration = ver === 1 ? Number(data.getBigUint64(at)) : data.getUint32(at), mediaTime = ver === 1 ? Number(data.getBigInt64(at + 8)) : data.getInt32(at + 4);
        if (mediaTime === -1) shift += duration / movieScale * timescale; else { shift -= mediaTime; break; }
      }
    }
    for (let i = 0; i < count; i++) pts[i] = (pts[i] + shift) / timescale * 1e6;
    return { codec, description, width, height, offsets, sizes, pts, keys };
  }
  throw new Error('No video track');
}

export class SequentialDecoder {
  private decoder!: VideoDecoder; private config!: VideoDecoderConfig;
  private queue: VideoFrame[] = []; private current: VideoFrame | null = null;
  private next = 0; private flushing: Promise<void> | null = null; private failure: Error | null = null;
  private wake: (() => void) | null = null;
  private window: { offset: number; bytes: Uint8Array<ArrayBufferLike> } = { offset: 0, bytes: new Uint8Array(0) };
  private constructor(private track: Track, private read: Reader) {}
  static async open(api: RecorderAPI, mediaId: string) {
    if (typeof VideoDecoder === 'undefined') throw new Error('WebCodecs is unavailable');
    const size = await api.mediaSize(mediaId);
    const read: Reader = async (offset, length) => new Uint8Array(await api.readMedia(mediaId, offset, Math.max(1, Math.min(length, size - offset))));
    const track = await demux(read, size);
    if (!track.pts.length) throw new Error('Video has no frames');
    const instance = new SequentialDecoder(track, read);
    for (let i = 0; i < track.keys.length; i++) if (track.keys[i]) instance.keyIndices.push(i);
    const base: VideoDecoderConfig = { codec: track.codec, description: track.description, codedWidth: track.width, codedHeight: track.height, optimizeForLatency: false };
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
      const candidate = { ...base, hardwareAcceleration };
      if ((await VideoDecoder.isConfigSupported(candidate)).supported) { instance.config = candidate; break; }
    }
    if (!instance.config) throw new Error(`Decoder does not support ${track.codec}`);
    instance.create();
    return instance;
  }
  private create() {
    this.decoder = new VideoDecoder({
      output: frame => { this.queue.push(frame); this.signal(); },
      error: error => { this.failure = error instanceof Error ? error : new Error(String(error)); this.signal(); },
    });
    this.decoder.addEventListener('dequeue', () => this.signal());
    this.decoder.configure(this.config);
  }
  private signal() { const wake = this.wake; this.wake = null; wake?.(); }
  private waitForDecoder() { return new Promise<void>(resolve => { this.wake = resolve; }); }
  private async sample(index: number) {
    const offset = this.track.offsets[index], size = this.track.sizes[index], w = this.window;
    if (offset < w.offset || offset + size > w.offset + w.bytes.length) { w.offset = offset; w.bytes = await this.read(offset, Math.max(size, 8 * 1024 * 1024)); }
    return w.bytes.subarray(offset - w.offset, offset - w.offset + size);
  }
  private reset(index: number) {
    for (const frame of this.queue) frame.close(); this.queue = [];
    if (this.decoder.state === 'closed') this.create(); else { this.decoder.reset(); this.decoder.configure(this.config); }
    this.next = index; this.flushing = null;
  }
  private keyIndices: number[] = [];
  /** Last keyframe (in decode order) whose presentation time is at or before `time`. */
  private keyframeBefore(time: number) {
    const keys = this.keyIndices; let lo = 0, hi = keys.length - 1, found = keys[0] ?? 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (this.track.pts[keys[mid]] <= time + 500) { found = keys[mid]; lo = mid + 1; } else hi = mid - 1; }
    return found;
  }
  /** The frame on screen at `seconds`. The returned frame stays valid until the next call. */
  async frameAt(seconds: number): Promise<VideoFrame> {
    const target = seconds * 1e6, tolerance = 500, key = this.keyframeBefore(target);
    const fresh = this.next === 0 && !this.current && !this.queue.length;
    const backwards = !!this.current && this.current.timestamp > target + tolerance;
    // Jumping to a keyframe that has not been fed yet is cheaper than decoding everything up to it.
    if (fresh || backwards || key >= this.next) { this.current?.close(); this.current = null; this.reset(key); }
    for (;;) {
      if (this.failure) throw this.failure;
      while (this.queue.length && this.queue[0].timestamp <= target + tolerance) { this.current?.close(); this.current = this.queue.shift()!; }
      // A target before the first decodable frame shows that frame.
      if (!this.current && this.queue.length) this.current = this.queue.shift()!;
      if (this.current && this.queue.length) return this.current;
      if (this.next < this.track.pts.length) {
        if (this.decoder.decodeQueueSize >= 6 || this.queue.length >= 4) { await this.waitForDecoder(); continue; }
        const index = this.next++, data = await this.sample(index);
        this.decoder.decode(new EncodedVideoChunk({ type: this.track.keys[index] ? 'key' : 'delta', timestamp: Math.round(this.track.pts[index]), data: data as Uint8Array<ArrayBuffer> }));
        continue;
      }
      // Out of samples: drain the decoder; the last frame holds until the end.
      this.flushing ??= this.decoder.flush().catch(error => { this.failure = error; });
      if (this.queue.length || this.decoder.decodeQueueSize > 0) { await Promise.race([this.flushing, this.waitForDecoder()]); continue; }
      await this.flushing;
      if (this.queue.length) continue;
      if (this.current) return this.current;
      throw new Error('No decodable frame at this time');
    }
  }
  close() { for (const frame of this.queue) frame.close(); this.queue = []; this.current?.close(); this.current = null; if (this.decoder.state !== 'closed') this.decoder.close(); }
}
