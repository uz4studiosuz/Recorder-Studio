// Boots the built production app and checks the real sandboxed preload bridge.
const { app } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
delete process.env.RECORDER_DEV_URL;
app.setPath('userData', path.resolve('.runtime-test'));
const timeout = setTimeout(() => { console.error('Desktop smoke test timed out'); app.exit(1); }, 20000);
app.on('browser-window-created', (_event, window) => {
  window.hide();
  window.webContents.on('did-fail-load', (_event, code, message) => {
    console.error('Renderer failed to load', code, message); app.exit(1);
  });
  window.webContents.once('did-finish-load', async () => {
    try {
      const result = await window.webContents.executeJavaScript(`(async () => ({
        title: document.title,
        rendered: document.body.innerText.includes('What would you'),
        hasNode: typeof window.require !== 'undefined',
        info: await window.recorder.getAppInfo()
      }))()`);
      if (result.title !== 'Recorder Studio' || !result.rendered || result.hasNode || !result.info.version) throw new Error(JSON.stringify(result));
      console.log('Desktop smoke test passed:', JSON.stringify(result));
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
});
void import(pathToFileURL(path.resolve('dist-electron/electron/main.js')).href).catch(error => {
  console.error(error); app.exit(1);
});
