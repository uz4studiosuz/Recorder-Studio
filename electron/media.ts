import { app, protocol } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { byteRange } from '../shared/byte-range.js';
import path from 'node:path';
import type { MediaAsset } from '../shared/api.js';

export const assets = new Map<string, string>();
export async function registerMedia(file: string): Promise<MediaAsset> {
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error('Media file does not exist');
  const id = randomUUID(); assets.set(id, file);
  return { id, url: `studio://media/${id}`, name: path.basename(file) };
}
export function mediaPath(id: string) {
  const file = assets.get(id);
  if (!file) throw new Error('Media is no longer available. Reopen the file.');
  return file;
}
export async function sessionFolder() {
  const folder = path.join(app.getPath('videos'), 'Recorder Studio', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
  await fs.mkdir(folder, { recursive: true }); return folder;
}
export function installMediaProtocol() {
  protocol.handle('studio', async request => {
    const url = new URL(request.url);
    const file = url.hostname === 'media' ? assets.get(url.pathname.slice(1)) : undefined;
    if (!file) return new Response('Not found', { status: 404 });
    const { size } = await fs.stat(file), range = byteRange(request.headers.get('Range'), size);
    const headers = new Headers({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range', 'Accept-Ranges': 'bytes', 'Content-Type': ({ '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.gif': 'image/gif' } as Record<string, string>)[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    if (range === false) { headers.set('Content-Range', `bytes */${size}`); return new Response(null, { status: 416, headers }); }
    const start = range ? range.start : 0, end = range ? range.end : size - 1;
    headers.set('Content-Length', String(Math.max(0, end - start + 1)));
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    const body = request.method === 'HEAD' || !size ? null : Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array<ArrayBuffer>>;
    return new Response(body, { status: range ? 206 : 200, headers });
  });
}
