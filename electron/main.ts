import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, protocol, globalShortcut, shell, screen, session, type WebContents } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { installMediaProtocol, mediaPath, registerMedia } from './media.js';
import * as capture from './capture.js';
import * as exporter from './export.js';
import { settings, telemetry } from './validation.js';
import type { RecorderAPI, SavedProject, CaptureOptions, StudioHandoff } from '../shared/api.js';
import { createRequire } from 'node:module';
import { runFFmpeg } from './ffmpeg.js';
import { writeBundle, extractBundle } from './bundle.js';
import { randomUUID } from 'node:crypto';
import * as library from './library.js';

protocol.registerSchemesAsPrivileged([{ scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
const directory = path.dirname(fileURLToPath(import.meta.url));
const devUrl = !app.isPackaged ? process.env.RECORDER_DEV_URL : undefined;
if (devUrl && devUrl !== 'http://127.0.0.1:5173') throw new Error('Invalid development origin');
// public/icon.png is copied into dist/ by Vite; packaged builds also embed build/icon.ico in the exe.
const icon = path.join(directory, '../../dist/icon.png');
let window: BrowserWindow | null = null;
let hud: BrowserWindow | null = null;
/** The compact launch bar shown at startup (like Recordly's floating launcher). */
let launcher: BrowserWindow | null = null;
/** The renderer that started the active recording; it owns stop requests and restore. */
let owner: BrowserWindow | null = null;
let pendingHandoff: StudioHandoff | null = null;
/** Set once the studio renderer has mounted and asked for handoffs; pushes before that would be lost. */
let studioListening = false;
let lastSender: WebContents | null = null;
let armedUntil = 0;
let loopbackArmed = false;
let quitting = false;
const verifyInstall = process.argv.includes('--verify-install');
function handle(name: string, callback: (...args: any[]) => unknown) {
  ipcMain.handle(name, (event, ...args: unknown[]) => {
    if (!trusted(event.sender) && (!hud || event.sender !== hud.webContents) || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted sender');
    lastSender = event.sender;
    return callback(...args);
  });
}
/** Windows that may record: the full studio and the compact launcher. */
function trusted(contents: WebContents | null | undefined) { return !!contents && (contents === window?.webContents || contents === launcher?.webContents); }
function senderWindow() { return lastSender ? BrowserWindow.fromWebContents(lastSender) : null; }
async function loadRenderer(target: BrowserWindow, query?: Record<string, string>) {
  if (devUrl) await target.loadURL(`${devUrl}/${query ? '?' + new URLSearchParams(query).toString() : ''}`);
  else await target.loadFile(path.join(directory, '../../dist/index.html'), query ? { query } : undefined);
}
function harden(contents: WebContents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
}
/** Media permissions are session-wide; grant them only to trusted renderers during the armed window. */
function installPermissions() {
  const allowed = (permission: string) => permission === 'fullscreen' || (['media', 'display-capture'].includes(permission) && Date.now() < armedUntil);
  session.defaultSession.setPermissionCheckHandler((requester, permission) => trusted(requester) && allowed(permission));
  session.defaultSession.setPermissionRequestHandler((requester, permission, callback) => callback(trusted(requester) && allowed(permission)));
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const fromTrusted = [window, launcher].some(item => item && !item.isDestroyed() && request.frame === item.webContents.mainFrame);
    if (!loopbackArmed || Date.now() > armedUntil || !fromTrusted) { callback({}); return; }
    loopbackArmed = false;
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      callback({ video: sources[0], audio: 'loopback' });
    } catch { callback({}); }
  });
}
function createLauncher() {
  if (launcher && !launcher.isDestroyed()) { launcher.show(); launcher.focus(); return launcher; }
  const area = screen.getPrimaryDisplay().workArea, width = 1120, height = 104;
  launcher = new BrowserWindow({ icon, width, height, x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + area.height - height - 48),
    frame: false, transparent: true, resizable: false, maximizable: false, fullscreenable: false, alwaysOnTop: true, hasShadow: false, title: 'Recorder Studio', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  const contents = launcher.webContents;
  harden(contents);
  launcher.on('close', event => { if (owner === launcher && capture.captureStatus().active && !quitting) { event.preventDefault(); contents.send('capture:stop-request'); } });
  launcher.on('closed', () => { launcher = null; });
  contents.on('render-process-gone', () => { if (owner === launcher) void capture.cancelCapture(); });
  void loadRenderer(launcher, { launcher: '1' });
  return launcher;
}
/** Shows the studio window; an optional recording result opens straight in the editor. */
function openStudio(handoff?: StudioHandoff) {
  if (handoff) pendingHandoff = handoff;
  if (!window || window.isDestroyed()) createWindow();
  else { if (window.isMinimized()) window.restore(); window.show(); window.focus(); deliverHandoff(); }
  launcher?.hide();
}
function deliverHandoff() {
  if (!pendingHandoff || !studioListening || !window || window.isDestroyed() || window.webContents.isLoading()) return;
  window.webContents.send('studio:handoff', pendingHandoff); pendingHandoff = null;
}
function trackKind(kind: string) { if (!['audio', 'webcam'].includes(kind)) throw new Error('Invalid track'); return kind; }
function bytes(data: ArrayBuffer, limit = 32 * 1024 * 1024) { if (!(data instanceof ArrayBuffer) || data.byteLength < 1 || data.byteLength > limit) throw new Error('Invalid data chunk'); return data; }
function createWindow() {
  window = new BrowserWindow({ show: !verifyInstall, icon, width: 1440, height: 940, minWidth: 1000, minHeight: 700,
    backgroundColor: '#0D0D0F', title: 'Recorder Studio', autoHideMenuBar: true,
    webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  const contents = window.webContents;
  harden(contents);
  contents.on('did-start-loading', () => { studioListening = false; });
  contents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { event.preventDefault(); void contents.executeJavaScript("window.dispatchEvent(new Event('studio:fullscreen'))", true); return; }
    if (input.type !== 'keyDown' || !(input.control || input.meta)) return;
    const key = input.key.toLowerCase();
    const command = ['+', '='].includes(key) ? 'zoom-in' : ['-', '_'].includes(key) ? 'zoom-out' : key === '0' ? 'zoom-reset' : null;
    if (command) { event.preventDefault(); contents.send('editor:shortcut', command); }
  });
  window.on('close', event => {
    if (owner === window && capture.captureStatus().active && !quitting) { event.preventDefault(); contents.send('capture:stop-request'); }
  });
  window.on('closed', () => { window = null; studioListening = false; if (launcher && !launcher.isDestroyed() && !quitting) launcher.show(); });
  contents.on('render-process-gone', () => { if (owner === window) void capture.cancelCapture(); void exporter.cancelExport(); });
  if (verifyInstall) contents.once('did-finish-load', async () => {
    try {
      const require = createRequire(import.meta.url);
      const hook = !!require('uiohook-napi').uIOhook;
      const ffi = require('koffi').version;
      await runFFmpeg(['-version']);
      const info = await contents.executeJavaScript('window.recorder.getAppInfo()');
      const assets = path.join(directory, '../../dist/assets');
      const vision = (await fs.readdir(assets)).find(name => /^vision_bundle-.*\.js$/.test(name));
      if (!vision) throw new Error('Bundled segmentation module is missing');
      const model = await contents.executeJavaScript(`(async () => {
        const { FilesetResolver, ImageSegmenter } = await import(${JSON.stringify(pathToFileURL(path.join(assets, vision)).href)});
        const base = new URL('vision/', document.baseURI).href;
        const segmenter = await ImageSegmenter.createFromOptions(await FilesetResolver.forVisionTasks(base), { baseOptions: { modelAssetPath: base + 'selfie_segmenter.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', outputConfidenceMasks: true });
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        const context = canvas.getContext('2d'); context.fillStyle = '#315979'; context.fillRect(0, 0, 64, 64);
        const result = segmenter.segment(canvas); const pixels = result.confidenceMasks?.[0]?.getAsFloat32Array().length;
        result.close(); segmenter.close(); if (!pixels) throw new Error('Packaged segmentation returned no mask'); return pixels;
      })()`);
      console.log(JSON.stringify({ packaged: app.isPackaged, hook, ffi, ffmpeg: true, modelPixels: model, info }));
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
  void loadRenderer(window);
}
void app.whenReady().then(() => {
  installMediaProtocol();
  installPermissions();
  handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));
  handle('background:browse', () => shell.openExternal('https://unsplash.com/wallpapers'));
  handle('media:open', async () => {
    const result = await dialog.showOpenDialog({ filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v'] }], properties: ['openFile'] });
    return result.canceled ? null : registerMedia(result.filePaths[0]);
  });
  handle('capture:targets', capture.targets);
  handle('capture:start', async (id: string, options?: CaptureOptions) => {
    if (options?.keystrokes !== undefined && typeof options.keystrokes !== 'boolean') throw new Error('Invalid capture options');
    if (typeof id !== 'string') throw new Error('Invalid source');
    owner = senderWindow();
    owner?.minimize();
    try { await capture.startCapture(id, () => { capture.beginStop(); owner?.restore(); owner?.webContents.send('capture:stop-request'); }, options); }
    catch (error) { owner?.restore(); throw error; }
    hud = new BrowserWindow({ icon, width: 440, height: 82, resizable: false, frame: false, alwaysOnTop: true, skipTaskbar: true, backgroundColor: '#16161a', webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    globalShortcut.register('CommandOrControl+Shift+H', () => { if (hud?.isVisible()) hud.hide(); else hud?.showInactive(); });
    hud.setContentProtection(true);
    hud.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    if (devUrl) await hud.loadURL(`${devUrl}/?hud=1`);
    else await hud.loadFile(path.join(directory, '../../dist/index.html'), { query: { hud: '1' } });
  });
  handle('capture:request-stop', () => { capture.beginStop(); hud?.destroy(); hud = null; owner?.restore(); owner?.webContents.send('capture:stop-request'); });
  handle('capture:prepare-stop', () => { capture.beginStop(); hud?.destroy(); hud = null; owner?.restore(); });
  handle('capture:reveal', () => { const folder = capture.captureStatus().folder; if (folder) return shell.openPath(folder).then(error => { if (error) throw new Error(error); }); });
  handle('capture:marker', capture.addMarker);
  handle('capture:stop', async () => { globalShortcut.unregister('CommandOrControl+Shift+H'); hud?.destroy(); hud = null; try { return await capture.stopCapture(); } finally { owner?.restore(); owner = null; } });
  handle('capture:cancel', async () => { globalShortcut.unregister('CommandOrControl+Shift+H'); hud?.destroy(); hud = null; await capture.cancelCapture(); owner?.restore(); owner = null; });
  handle('launcher:open-studio', (handoff?: StudioHandoff) => {
    if (handoff !== undefined && handoff !== null) {
      if (typeof handoff !== 'object' || !handoff.media || typeof handoff.media.id !== 'string') throw new Error('Invalid recording handoff');
      mediaPath(handoff.media.id); if (handoff.webcam) mediaPath(handoff.webcam.id); telemetry(handoff.telemetry);
      if (!['screen', 'camera', 'split', 'overlay', 'cutout'].includes(handoff.layout) || !['16:9', '9:16'].includes(handoff.aspectRatio) || !['fit', 'follow'].includes(handoff.fitMode)) throw new Error('Invalid recording handoff');
    }
    openStudio(handoff ?? undefined);
  });
  // The studio renderer pulls a pending recording once React has mounted its listener.
  handle('studio:take-handoff', () => { if (lastSender !== window?.webContents) return null; studioListening = true; const handoff = pendingHandoff; pendingHandoff = null; return handoff; });
  handle('launcher:resize', (width: number, height: number) => {
    if (!launcher || !Number.isInteger(width) || !Number.isInteger(height) || width < 480 || width > 1600 || height < 80 || height > 520) return;
    // Grow upward and keep the bar centered where the user placed it.
    const bounds = launcher.getBounds(), area = screen.getDisplayMatching(bounds).workArea;
    const x = Math.round(Math.min(Math.max(area.x, bounds.x + (bounds.width - width) / 2), area.x + area.width - width));
    launcher.setBounds({ x, y: bounds.y + bounds.height - height, width, height });
  });
  handle('launcher:show', () => { createLauncher(); window?.minimize(); });
  handle('launcher:minimize', () => { launcher?.minimize(); });
  handle('capture:countdown', async (seconds: number) => {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 10) throw new Error('Invalid countdown');
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, size = 240;
    const overlay = new BrowserWindow({ width: size, height: size, x: Math.round(area.x + (area.width - size) / 2), y: Math.round(area.y + (area.height - size) / 2),
      frame: false, transparent: true, resizable: false, focusable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false, backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    overlay.setIgnoreMouseEvents(true); overlay.setContentProtection(true); overlay.setAlwaysOnTop(true, 'screen-saver');
    harden(overlay.webContents);
    try {
      await loadRenderer(overlay, { countdown: String(seconds) }); overlay.showInactive();
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    } finally { overlay.destroy(); }
  });
  handle('capture:status', capture.captureStatus);
  handle('capture:arm-media', () => { armedUntil = Date.now() + 60000; loopbackArmed = true; });
  handle('track:begin', (kind: string) => capture.beginTrack(trackKind(kind)));
  handle('track:append', (kind: string, data: ArrayBuffer) => capture.appendTrack(trackKind(kind), bytes(data)));
  handle('track:end', (kind: string) => capture.endTrack(trackKind(kind)));
  handle('library:list', library.listProjects);
  handle('library:save', library.saveLibrary);
  handle('library:open', library.openLibrary);
  handle('export:reveal', exporter.revealExport);
  handle('project:import-any', async () => {
    const selected = await dialog.showOpenDialog({ title: 'Import project or video', filters: [{ name: 'Project or video', extensions: ['rsproject', 'json', 'zip', 'mp4', 'webm', 'mov', 'm4v'] }], properties: ['openFile'] });
    if (selected.canceled) return null; const source = selected.filePaths[0], extension = path.extname(source).toLowerCase();
    if (extension === '.json') return loadProject(source);
    if (['.rsproject', '.zip'].includes(extension)) { const folder = path.join(app.getPath('videos'), 'Recorder Studio', 'Projects', randomUUID()); return loadProject(await extractBundle(source, folder)); }
    return registerMedia(source);
  });
  handle('project:save', async (project: SavedProject) => {
    settings(project.settings); telemetry(project.telemetry);
    const source = mediaPath(project.media.id); const webcam = project.webcam ? mediaPath(project.webcam.id) : undefined;
    const result = await dialog.showSaveDialog({ defaultPath: 'Project.recorder.json', filters: [{ name: 'Recorder Studio project', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    const file = result.filePath;
    await fs.writeFile(`${file}.tmp`, JSON.stringify({ version: 1, source, webcam, telemetry: project.telemetry, settings: project.settings }));
    await fs.rename(`${file}.tmp`, file); return true;
  });
  handle('project:export', async (project: SavedProject) => {
    settings(project.settings); telemetry(project.telemetry);
    const source = mediaPath(project.media.id), webcam = project.webcam ? mediaPath(project.webcam.id) : undefined;
    const base = path.parse(project.media.name).name.replace(/[^\w .-]/g, '').trim() || 'Project';
    const result = await dialog.showSaveDialog({ title: 'Export project', defaultPath: `${base}.rsproject`, filters: [{ name: 'Recorder Studio project bundle', extensions: ['rsproject'] }] });
    if (result.canceled || !result.filePath) return null;
    const output = result.filePath.toLowerCase().endsWith('.rsproject') ? result.filePath : `${result.filePath}.rsproject`;
    const media = (file: string, name: string) => `media/${name}${path.extname(file).toLowerCase()}`;
    const json = { version: 1, source: media(source, 'screen'), webcam: webcam ? media(webcam, 'webcam') : undefined, telemetry: project.telemetry, settings: project.settings };
    const partial = `${output}.${randomUUID()}.partial`;
    try {
      await writeBundle(partial, [{ name: 'project.json', data: Buffer.from(JSON.stringify(json)) }, { name: json.source, file: source }, ...(webcam ? [{ name: json.webcam!, file: webcam }] : [])], fraction => window?.setProgressBar(fraction));
      await fs.rm(output, { force: true }); await fs.rename(partial, output);
    } catch (error) { await fs.rm(partial, { force: true }); throw error; }
    finally { window?.setProgressBar(-1); }
    return output;
  });
  handle('project:import', async () => {
    const result = await dialog.showOpenDialog({ title: 'Import project', filters: [{ name: 'Recorder Studio project bundle', extensions: ['rsproject', 'zip'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    const bundle = result.filePaths[0];
    const name = path.parse(bundle).name.replace(/[^\w .-]/g, '').trim().slice(0, 60) || 'Project';
    const folder = path.join(app.getPath('videos'), 'Recorder Studio', 'Projects', `${name}-${randomUUID().slice(0, 8)}`);
    try { return await loadProject(await extractBundle(bundle, folder, fraction => window?.setProgressBar(fraction))); }
    catch (error) { await fs.rm(folder, { recursive: true, force: true }); throw error; }
    finally { window?.setProgressBar(-1); }
  });
  handle('project:open', async () => {
    const result = await dialog.showOpenDialog({ filters: [{ name: 'Recorder Studio project', extensions: ['json'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    return loadProject(result.filePaths[0]);
  });
  async function loadProject(file: string) {
    if ((await fs.stat(file)).size > 256 * 1024 * 1024) throw new Error('Project file is too large');
    const project = JSON.parse(await fs.readFile(file, 'utf8'));
    if (project.version !== 1) throw new Error('Unsupported project version');
    project.settings = { ...project.settings, canvas: { fitMode: 'fit', cropX: 0.5, cropY: 0.5, ...project.settings.canvas }, webcamPosition: project.settings.webcamPosition ?? 'bottom-right', webcamDodge: project.settings.webcamDodge ?? true };
    settings(project.settings); telemetry(project.telemetry);
    const resolve = (input: string) => { if (typeof input !== 'string' || !/\.(mp4|webm|mov|m4v)$/i.test(input)) throw new Error('Invalid project media path'); return path.resolve(path.dirname(file), input); };
    return { version: 1, media: await registerMedia(resolve(project.source)), webcam: project.webcam ? await registerMedia(resolve(project.webcam)) : undefined, telemetry: project.telemetry, settings: project.settings } satisfies SavedProject;
  }
  handle('export:start', (input: Parameters<RecorderAPI['startExport']>[0]) => { settings(input.settings); telemetry(input.telemetry); return exporter.startExport(input); });
  handle('export:frame', (id: string, data: ArrayBuffer) => exporter.exportFrame(id, bytes(data, 3840 * 3840 * 4)));
  handle('export:chunk', (id: string, data: ArrayBuffer) => exporter.exportChunk(id, bytes(data, 64 * 1024 * 1024)));
  handle('media:size', async (id: string) => (await fs.stat(mediaPath(id))).size);
  handle('media:read', async (id: string, offset: number, length: number) => {
    if (![offset, length].every(Number.isSafeInteger) || offset < 0 || length < 1 || length > 64 * 1024 * 1024) throw new Error('Invalid media read');
    const file = await fs.open(mediaPath(id), 'r');
    try { const buffer = Buffer.alloc(length); const { bytesRead } = await file.read(buffer, 0, length, offset); return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead); }
    finally { await file.close(); }
  });
  handle('export:finish', exporter.finishExport);
  handle('export:cancel', exporter.cancelExport);
  // Start in the compact launcher like Recordly; tests and --verify-install open the studio directly.
  if (verifyInstall || process.env.RECORDER_START_VIEW === 'studio' || process.argv.includes('--studio')) createWindow(); else createLauncher();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createLauncher(); });
});
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true; globalShortcut.unregisterAll();
  void Promise.allSettled([capture.cancelCapture(), exporter.cancelExport()]).then(() => app.quit());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
