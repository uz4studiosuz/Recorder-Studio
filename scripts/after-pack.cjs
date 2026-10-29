// signAndEditExecutable is off (it needs the winCodeSign download), so the app icon is embedded here with rcedit.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const rcedit = path.resolve(__dirname, '../node_modules/electron-winstaller/vendor/rcedit.exe');
  if (!fs.existsSync(rcedit)) { console.warn('rcedit not found; the exe keeps the default Electron icon'); return; }
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const version = context.packager.appInfo.version;
  execFileSync(rcedit, [exe,
    '--set-icon', path.resolve(__dirname, '../build/icon.ico'),
    '--set-version-string', 'ProductName', 'Recorder Studio',
    '--set-version-string', 'FileDescription', 'Recorder Studio',
    '--set-file-version', version, '--set-product-version', version,
  ], { stdio: 'inherit' });
};
