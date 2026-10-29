import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LibraryEntry, RecorderAPI, SavedProject } from '../shared/api.js';
import { mediaPath, registerMedia } from './media.js';
import { settings, telemetry } from './validation.js';
import { outputDuration } from '../shared/timeline.js';
const root = () => path.join(app.getPath('userData'), 'projects');
function file(id: string) { if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid project ID'); return path.join(root(), `${id}.json`); }
export async function listProjects(): Promise<LibraryEntry[]> {
  await fs.mkdir(root(), { recursive: true });
  const entries = await Promise.all((await fs.readdir(root())).filter(name => /^[a-f0-9-]{36}\.meta\.json$/i.test(name)).slice(0, 2000).map(async name => { try { return JSON.parse(await fs.readFile(path.join(root(), name), 'utf8')) as LibraryEntry; } catch { return null; } }));
  return entries.filter((entry): entry is LibraryEntry => !!entry).sort((a, b) => b.updatedAt - a.updatedAt);
}
async function atomic(destination: string, data: unknown) { const temporary = `${destination}.${randomUUID()}.tmp`; await fs.writeFile(temporary, JSON.stringify(data)); await fs.rename(temporary, destination); }
export async function saveLibrary(input: Parameters<RecorderAPI['saveLibrary']>[0]) {
  const id = input.id ?? randomUUID(), destination = file(id); await fs.mkdir(root(), { recursive: true });
  if (input.thumbnail && (input.thumbnail.length > 1_000_000 || !/^data:image\/jpeg;base64,[\w+/=]+$/.test(input.thumbnail))) throw new Error('Invalid thumbnail');
  const edit = input.project?.settings ?? input.settings; if (!edit) throw new Error('Project settings are required'); settings(edit);
  const previous = input.id ? JSON.parse(await fs.readFile(destination, 'utf8')) : undefined;
  if (!input.project && !previous) throw new Error('New projects require media');
  const source = input.project ? mediaPath(input.project.media.id) : previous.source;
  const webcam = input.project ? input.project.webcam ? mediaPath(input.project.webcam.id) : undefined : previous.webcam;
  if (input.project) { telemetry(input.project.telemetry); await atomic(path.join(root(), `${id}.telemetry.json`), input.project.telemetry); }
  const entry: LibraryEntry = { id, name: previous?.entry.name ?? path.parse(input.project!.media.name).name, updatedAt: Date.now(), duration: outputDuration(edit), thumbnail: input.thumbnail ?? previous?.entry.thumbnail };
  await atomic(destination, { version: 1, entry, source, webcam, settings: edit });
  await atomic(path.join(root(), `${id}.meta.json`), entry);
  return entry;
}
export async function openLibrary(id: string): Promise<SavedProject> {
  const document = JSON.parse(await fs.readFile(file(id), 'utf8')), events = JSON.parse(await fs.readFile(path.join(root(), `${id}.telemetry.json`), 'utf8')); settings(document.settings); telemetry(events);
  return { version: 1, media: await registerMedia(document.source), webcam: document.webcam ? await registerMedia(document.webcam) : undefined, settings: document.settings, telemetry: events };
}
