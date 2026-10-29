const { app, dialog, BrowserWindow, clipboard, ClipboardItem } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
app.setPath('userData', path.resolve('.runtime-test'));
app.setPath('videos', path.resolve('.integration'));
delete process.env.RECORDER_DEV_URL;
const timer = setTimeout(() => { console.error('Integration test timed out'); app.exit(1); }, 120000);
const load = name => import(pathToFileURL(path.resolve(`dist-electron/electron/${name}.js`)).href);
let exportNumber = 0;
dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.resolve('.integration', ['export.mp4', 'export.gif', 'cancelled.mp4', 'cuts.mp4', 'reels.mp4', 'cutout.mp4', '4k.mp4'][exportNumber++] || 'project.recorder.json') });
app.once('browser-window-created', (_event, window) => {
  window.hide();
  window.webContents.on('console-message', event => console.log('Renderer:', event.message));
  window.webContents.once('did-finish-load', async () => {
    try {
      const { runFFmpeg, launch, completion, mediaDuration } = await load('ffmpeg');
      const capture = await load('capture');
      const { registerMedia } = await load('media');
      await fs.mkdir('.integration', { recursive: true });
      const portraitFile = path.resolve('.integration/person.jpg');
      try { await fs.access(portraitFile); } catch {
        const response = await fetch('https://storage.googleapis.com/mediapipe-assets/portrait.jpg', { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error('Unable to download the public MediaPipe portrait test fixture');
        await fs.writeFile(portraitFile, Buffer.from(await response.arrayBuffer()));
      }
      const fixture = path.resolve('.integration/fixture.mp4');
      await runFFmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=60:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', fixture]);
      const media = await registerMedia(fixture);
      const webcamFile = path.resolve('.integration/webcam-fixture.mp4');
      await runFFmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', webcamFile]);
      const webcam = await registerMedia(webcamFile);
      const personFile = path.resolve('.integration/person.mp4');
      await runFFmpeg(['-loop', '1', '-i', path.resolve('.integration/person.jpg'), '-t', '2', '-vf', 'scale=480:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', personFile]);
      const person = await registerMedia(personFile);
      await window.webContents.executeJavaScript('try {' + await fs.readFile('.integration/renderer.js', 'utf8') + '; "loaded"; } catch (error) { console.error(error.stack); throw error; }');
      const playback = await window.webContents.executeJavaScript(`RecorderIntegration.playbackRegression(${JSON.stringify(media)})`);
      console.log('Playback and project library regression:', JSON.stringify(playback));
      const previousClipboard = await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
      let result;
      try {
        result = await window.webContents.executeJavaScript(`RecorderIntegration.run(${JSON.stringify(media)}, ${JSON.stringify(webcam)}, ${JSON.stringify(person)}).catch(error => ({ error: String(error), stack: error.stack }))`);
        if (!result.error && !await clipboard.has('text/uri-list')) throw new Error('Clipboard export is not a native file reference');
        if (!result.error && process.platform === 'win32') {
          const koffi = require('koffi');
          const available = koffi.load('user32.dll').func('bool __stdcall IsClipboardFormatAvailable(uint32 format)');
          if (!available(15)) throw new Error('CF_HDROP file reference missing from Windows clipboard');
        }
      } finally { await clipboard.write(previousClipboard); }
      if (result.error) throw new Error(JSON.stringify(result));
      if (result.frames !== 30) throw new Error(`Expected 30 deterministic frames, got ${result.frames}`);
      if (!result.cancelled) throw new Error('Export cancellation did not complete');
      if (result.cutFrames !== 60) throw new Error('Ripple cut output did not contain exactly 60 frames');
      for (const [file, expected] of [[result.mp4, 30], [result.gif, 10], [result.cut, 60], [result.reels, 60], [result.cutout, 6], [result.ultraHD, 2]]) {
        const child = launch(['-i', file, '-map', '0:v:0', '-f', 'null', '-']); let log = '';
        child.stderr.on('data', data => { log = (log + data.toString()).slice(-8000); }); await completion(child);
        const decoded = Number([...log.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1]);
        if (decoded !== expected) throw new Error(`${file}: expected ${expected} decoded frames, got ${decoded}`);
      }
      if (!/^Hardware decode/.test(result.decoder)) throw new Error(`Export did not use sequential WebCodecs decoding: ${result.decoder}`);
      // The fixture is animated: a frozen export would repeat the same picture.
      for (const file of [result.mp4, result.cut, result.reels]) {
        const child = launch(['-i', file, '-map', '0:v:0', '-f', 'framemd5', '-']); let hashes = '';
        child.stdout.removeAllListeners('data'); child.stdout.on('data', data => { hashes += data.toString(); }); await completion(child);
        const lines = hashes.split('\n').filter(line => line && !line.startsWith('#')), unique = new Set(lines.map(line => line.split(',').at(-1).trim()));
        if (unique.size < lines.length * 0.8) throw new Error(`${file}: export looks frozen (${unique.size} distinct of ${lines.length} frames)`);
      }
      for (const [name, image] of Object.entries(result.layouts)) await fs.writeFile(path.resolve('.integration', `layout-${name}.png`), Buffer.from(image.split(',')[1], 'base64'));
      delete result.layouts;
      console.log('Compositor + MP4/GIF + audio + layouts + segmentation integration:', JSON.stringify(result));
      const abort = new AbortController();
      const abortTimer = setTimeout(() => abort.abort(), 250);
      try {
        let cancelled = false;
        try { await runFFmpeg(['-re', '-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=30', '-f', 'null', '-'], { signal: abort.signal }); }
        catch (error) { cancelled = String(error).includes('cancelled'); }
        if (!cancelled) throw new Error('FFmpeg finalization cancellation did not terminate');
      } finally { clearTimeout(abortTimer); }
      let timedOut = false;
      try { await runFFmpeg(['-re', '-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=30', '-f', 'null', '-'], { timeoutMs: 150 }); }
      catch (error) { timedOut = String(error).includes('time limit'); }
      if (!timedOut) throw new Error('FFmpeg finalization deadline was not enforced');
      console.log('Finalization abort and timeout regression checks passed');
      const fixtureWindow = new BrowserWindow({ width: 460, height: 280, title: 'Recorder Integration Capture', webPreferences: { sandbox: true, contextIsolation: true } });
      await fixtureWindow.loadURL('data:text/html,<title>Recorder Integration Capture</title><body style="background:%23527991;color:white;font:24px sans-serif">Recorder Studio capture fixture</body>');
      const targets = await capture.targets();
      const display = targets.find(target => target.kind === 'screen');
      if (!display) throw new Error('No capture screen');
      if (!display.thumbnail?.startsWith('data:image/')) throw new Error('Capture source thumbnail is missing');
      await capture.startCapture(display.id, () => {});
      await window.webContents.executeJavaScript('RecorderIntegration.startTracks()');
      capture.addMarker();
      await new Promise(resolve => setTimeout(resolve, 2000));
      capture.beginStop();
      if (capture.captureStatus().active) throw new Error('Screen should stop before track draining');
      await window.webContents.executeJavaScript('RecorderIntegration.finishTracks()');
      const phases = new Set();
      const poll = setInterval(() => phases.add(capture.captureStatus().stage), 10);
      let recording;
      try { recording = await capture.stopCapture(); } finally { clearInterval(poll); }
      if (!recording.webcam) throw new Error('Webcam track did not survive capture finalization');
      const rawDuration = await mediaDuration(path.join(recording.folder, 'raw.mp4'));
      for (const file of ['recording.mp4', 'webcam.mp4']) if (Math.abs(await mediaDuration(path.join(recording.folder, file)) - rawDuration) > 0.12) throw new Error(`${file} did not finish at the screen stop time`);
      if (!recording.telemetry.some(event => event.kind === 'marker')) throw new Error('Recording marker was not retained');
      console.log('Native screen + telemetry integration:', JSON.stringify({ folder: recording.folder, media: recording.media.name, events: recording.telemetry.length, phases: [...phases] }));
      const cropWidth = Math.min(1, (display.height * 9 / 16) / display.width);
      await capture.startCapture(display.id, () => {}, { region: { x: (1 - cropWidth) / 2, y: 0, width: cropWidth, height: 1 } });
      await new Promise(resolve => setTimeout(resolve, 1000));
      const portrait = await capture.stopCapture();
      console.log('Native portrait-region recording passed:', portrait.media.url);
      const windowTarget = targets.find(target => target.kind === 'window' && target.name === 'Recorder Integration Capture');
      if (windowTarget) {
        await capture.startCapture(windowTarget.id, () => {});
        await new Promise(resolve => setTimeout(resolve, 1000));
        const windowRecording = await capture.stopCapture();
        console.log('Native window capture passed:', windowTarget.name, windowRecording.media.name);
      }
      fixtureWindow.destroy();
      await fs.writeFile('.integration/results.json', JSON.stringify({ export: result, recording: { folder: recording.folder, events: recording.telemetry.length } }, null, 2));
      clearTimeout(timer); app.exit(0);
    } catch (error) { console.error(error); await (await load('capture')).cancelCapture(); app.exit(1); }
  });
});
void load('main').catch(error => { console.error(error); app.exit(1); });
