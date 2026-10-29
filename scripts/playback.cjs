const { app, BrowserWindow } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
app.setPath('userData', path.resolve('.runtime-test'));
delete process.env.RECORDER_DEV_URL;
const load = name => import(pathToFileURL(path.resolve(`dist-electron/electron/${name}.js`)).href);
const deadline = setTimeout(() => { console.error('Playback test timed out'); app.exit(1); }, 60000);
app.once('browser-window-created', (_event, window) => {
  window.hide(); window.webContents.on('console-message', event => console.log('Renderer:', event.message));
  window.webContents.once('did-finish-load', async () => {
    try {
      const { runFFmpeg } = await load('ffmpeg'), { registerMedia } = await load('media');
      const file = path.resolve('.integration/seek-colors.mp4'), camera = path.resolve('.integration/seek-camera.mp4');
      await runFFmpeg(['-f','lavfi','-i','color=red:s=640x360:r=30:d=2','-f','lavfi','-i','color=lime:s=640x360:r=30:d=2','-f','lavfi','-i','color=blue:s=640x360:r=30:d=2','-f','lavfi','-i','sine=frequency=880:duration=6','-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]','-map','[v]','-map','3:a','-c:v','libx264','-g','120','-pix_fmt','yuv420p','-c:a','aac',file]);
      await runFFmpeg(['-f','lavfi','-i','testsrc2=size=320x240:rate=30:duration=6','-c:v','libx264','-pix_fmt','yuv420p',camera]);
      const media = await registerMedia(file), webcam = await registerMedia(camera);
      await window.webContents.executeJavaScript(await fs.readFile('.integration/renderer.js','utf8'));
      const result = await window.webContents.executeJavaScript(`RecorderIntegration.cutFrameRegression(${JSON.stringify(media)}, ${JSON.stringify(webcam)})`);
      console.log('Real preview frame/audio regression:', JSON.stringify(result));
      clearTimeout(deadline); app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
});
void load('main');
