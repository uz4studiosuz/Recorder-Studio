import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Portable project bundles (.rsproject): a stored (uncompressed) ZIP64 archive holding project.json and the media it
 * uses. Video is already compressed, so storing keeps export fast and the file opens in any ZIP tool.
 */
const CHUNK = 4 * 1024 * 1024;
const table = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(data: Buffer, previous = 0) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(data, previous);
  let c = ~previous >>> 0; for (const byte of data) c = table[(c ^ byte) & 0xff] ^ (c >>> 8); return ~c >>> 0;
}
function dosTime(date = new Date()) {
  return { time: date.getHours() << 11 | date.getMinutes() << 5 | Math.floor(date.getSeconds() / 2), date: (date.getFullYear() - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate() };
}
export interface BundleEntry { name: string; file?: string; data?: Buffer }

export async function writeBundle(output: string, entries: BundleEntry[], onProgress?: (fraction: number) => void) {
  const handle = await fs.open(output, 'w');
  const central: Buffer[] = [], { time, date } = dosTime();
  const total = (await Promise.all(entries.map(async e => e.data?.length ?? (await fs.stat(e.file!)).size))).reduce((a, b) => a + b, 0) || 1;
  let offset = 0, done = 0;
  try {
    for (const entry of entries) {
      const name = Buffer.from(entry.name, 'utf8'), headerOffset = offset;
      const header = Buffer.alloc(30 + name.length + 20);
      header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(45, 4); header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(0, 8);
      header.writeUInt16LE(time, 10); header.writeUInt16LE(date, 12); header.writeUInt32LE(0xffffffff, 18); header.writeUInt32LE(0xffffffff, 22);
      header.writeUInt16LE(name.length, 26); header.writeUInt16LE(20, 28); name.copy(header, 30);
      header.writeUInt16LE(0x0001, 30 + name.length); header.writeUInt16LE(16, 32 + name.length);
      await handle.write(header, 0, header.length, offset); offset += header.length;
      let crc = 0, size = 0;
      if (entry.data) { crc = crc32(entry.data); size = entry.data.length; await handle.write(entry.data, 0, size, offset); offset += size; done += size; }
      else {
        const source = await fs.open(entry.file!, 'r'), buffer = Buffer.alloc(CHUNK);
        try {
          for (;;) {
            const { bytesRead } = await source.read(buffer, 0, CHUNK, size); if (!bytesRead) break;
            const chunk = buffer.subarray(0, bytesRead); crc = crc32(chunk, crc);
            await handle.write(chunk, 0, bytesRead, offset); offset += bytesRead; size += bytesRead; done += bytesRead; onProgress?.(done / total);
          }
        } finally { await source.close(); }
      }
      // Patch CRC and the ZIP64 sizes now that the data is written.
      const patch = Buffer.alloc(4); patch.writeUInt32LE(crc >>> 0); await handle.write(patch, 0, 4, headerOffset + 14);
      const sizes = Buffer.alloc(16); sizes.writeBigUInt64LE(BigInt(size), 0); sizes.writeBigUInt64LE(BigInt(size), 8); await handle.write(sizes, 0, 16, headerOffset + 34 + name.length);
      const record = Buffer.alloc(46 + name.length + 28);
      record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(45, 4); record.writeUInt16LE(45, 6); record.writeUInt16LE(0x0800, 8); record.writeUInt16LE(0, 10);
      record.writeUInt16LE(time, 12); record.writeUInt16LE(date, 14); record.writeUInt32LE(crc >>> 0, 16); record.writeUInt32LE(0xffffffff, 20); record.writeUInt32LE(0xffffffff, 24);
      record.writeUInt16LE(name.length, 28); record.writeUInt16LE(28, 30); record.writeUInt32LE(0xffffffff, 42); name.copy(record, 46);
      const extra = 46 + name.length; record.writeUInt16LE(0x0001, extra); record.writeUInt16LE(24, extra + 2);
      record.writeBigUInt64LE(BigInt(size), extra + 4); record.writeBigUInt64LE(BigInt(size), extra + 12); record.writeBigUInt64LE(BigInt(headerOffset), extra + 20);
      central.push(record);
    }
    const directory = Buffer.concat(central), directoryOffset = offset;
    await handle.write(directory, 0, directory.length, offset); offset += directory.length;
    const end = Buffer.alloc(56 + 20 + 22);
    end.writeUInt32LE(0x06064b50, 0); end.writeBigUInt64LE(44n, 4); end.writeUInt16LE(45, 12); end.writeUInt16LE(45, 14);
    end.writeBigUInt64LE(BigInt(entries.length), 24); end.writeBigUInt64LE(BigInt(entries.length), 32); end.writeBigUInt64LE(BigInt(directory.length), 40); end.writeBigUInt64LE(BigInt(directoryOffset), 48);
    end.writeUInt32LE(0x07064b50, 56); end.writeBigUInt64LE(BigInt(offset), 64); end.writeUInt32LE(1, 72);
    end.writeUInt32LE(0x06054b50, 76); end.writeUInt16LE(0xffff, 84); end.writeUInt16LE(0xffff, 86); end.writeUInt32LE(0xffffffff, 88); end.writeUInt32LE(0xffffffff, 92);
    await handle.write(end, 0, end.length, offset);
  } finally { await handle.close(); }
}

interface Stored { name: string; offset: number; size: number; crc: number }
async function readDirectory(handle: fs.FileHandle, fileSize: number): Promise<Stored[]> {
  const tailSize = Math.min(fileSize, 65557), tail = Buffer.alloc(tailSize);
  await handle.read(tail, 0, tailSize, fileSize - tailSize);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('This file is not a Recorder Studio project bundle');
  let count = tail.readUInt16LE(eocd + 10), size = tail.readUInt32LE(eocd + 12), start = tail.readUInt32LE(eocd + 16);
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50) throw new Error('Project bundle index is damaged');
    const record = Buffer.alloc(56); await handle.read(record, 0, 56, Number(tail.readBigUInt64LE(locator + 8)));
    if (record.readUInt32LE(0) !== 0x06064b50) throw new Error('Project bundle index is damaged');
    count = Number(record.readBigUInt64LE(32)); size = Number(record.readBigUInt64LE(40)); start = Number(record.readBigUInt64LE(48));
  }
  if (count > 64 || size > 1024 * 1024) throw new Error('Project bundle has an unexpected layout');
  const directory = Buffer.alloc(size); await handle.read(directory, 0, size, start);
  const entries: Stored[] = [];
  for (let at = 0, n = 0; n < count; n++) {
    if (directory.readUInt32LE(at) !== 0x02014b50) throw new Error('Project bundle index is damaged');
    if (directory.readUInt16LE(at + 10) !== 0) throw new Error('Compressed project bundles are not supported');
    const nameLength = directory.readUInt16LE(at + 28), extraLength = directory.readUInt16LE(at + 30), commentLength = directory.readUInt16LE(at + 32);
    const name = directory.toString('utf8', at + 46, at + 46 + nameLength);
    let entrySize = directory.readUInt32LE(at + 24), local = directory.readUInt32LE(at + 42);
    for (let e = at + 46 + nameLength; e < at + 46 + nameLength + extraLength;) {
      const id = directory.readUInt16LE(e), length = directory.readUInt16LE(e + 2);
      if (id === 0x0001) { let p = e + 4; if (directory.readUInt32LE(at + 24) === 0xffffffff) { entrySize = Number(directory.readBigUInt64LE(p)); p += 8; } if (directory.readUInt32LE(at + 20) === 0xffffffff) p += 8; if (directory.readUInt32LE(at + 42) === 0xffffffff) local = Number(directory.readBigUInt64LE(p)); }
      e += 4 + length;
    }
    const header = Buffer.alloc(30); await handle.read(header, 0, 30, local);
    if (header.readUInt32LE(0) !== 0x04034b50) throw new Error('Project bundle entry is damaged');
    entries.push({ name, offset: local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28), size: entrySize, crc: directory.readUInt32LE(at + 16) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
/** Extracts project.json and media/* into `folder`; returns the project.json path. */
export async function extractBundle(bundle: string, folder: string, onProgress?: (fraction: number) => void) {
  const handle = await fs.open(bundle, 'r');
  try {
    const entries = await readDirectory(handle, (await handle.stat()).size);
    if (!entries.some(e => e.name === 'project.json')) throw new Error('Project bundle has no project.json');
    const total = entries.reduce((sum, e) => sum + e.size, 0) || 1; let done = 0;
    await fs.mkdir(path.join(folder, 'media'), { recursive: true });
    for (const entry of entries) {
      // Only the names this app writes; anything else (including path traversal) is ignored.
      if (entry.name !== 'project.json' && !/^media\/[\w.-]{1,80}\.(mp4|webm|mov|m4v)$/i.test(entry.name)) continue;
      if (entry.name === 'project.json' && entry.size > 256 * 1024 * 1024) throw new Error('Project file is too large');
      const target = path.join(folder, ...entry.name.split('/'));
      const output = await fs.open(target, 'w'), buffer = Buffer.alloc(CHUNK);
      let crc = 0;
      try {
        for (let read = 0; read < entry.size;) {
          const { bytesRead } = await handle.read(buffer, 0, Math.min(CHUNK, entry.size - read), entry.offset + read);
          if (!bytesRead) throw new Error('Project bundle ends unexpectedly');
          const chunk = buffer.subarray(0, bytesRead); crc = crc32(chunk, crc);
          await output.write(chunk); read += bytesRead; done += bytesRead; onProgress?.(done / total);
        }
      } finally { await output.close(); }
      if ((crc >>> 0) !== entry.crc) throw new Error(`Project bundle is damaged (${entry.name} failed its checksum)`);
    }
    return path.join(folder, 'project.json');
  } finally { await handle.close(); }
}
