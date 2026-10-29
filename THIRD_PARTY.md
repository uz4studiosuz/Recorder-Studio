# Third-party runtime notices

Recorder Studio source code is MIT licensed. Bundled dependencies retain their own licenses.

## FFmpeg

The `ffmpeg-static` package and the bundled Windows FFmpeg executable are GPL-3.0-or-later/GPLv3 software. FFmpeg runs as a separate child process, without a shell. Its executable, release license, README, and build configuration remain inside `resources/app.asar.unpacked/node_modules/ffmpeg-static/` in the Windows build.

The installed Windows release is `6.1.1-essentials_build-www.gyan.dev`, obtained through `eugeneware/ffmpeg-static` release `b6.1.1`. The release README identifies FFmpeg source commit `e38092ef93` at https://github.com/FFmpeg/FFmpeg/commit/e38092ef93 and the build configuration. Upstream binary release: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1 . Build provider: https://www.gyan.dev/ffmpeg/builds/ .

For public redistribution, provide the corresponding source and build materials for the exact binary, including its linked libraries, under the GPL's applicable distribution terms. Retaining a license text alone does not replace the corresponding-source requirement. This repository's local installer is unsigned and has not been published.

## Native input and FFI

- `uiohook-napi`: MIT; the underlying libuiohook has its own license included with the package.
- `koffi`: MIT, including platform packages under `@koromix`.

## Desktop and UI

Electron bundles Chromium and Node.js with their third-party notices. Preserve Electron's `LICENSE` and `LICENSES.chromium.html` in the application directory. React, Zustand, Radix, Framer Motion, Lucide, Tailwind, and Inter retain their package licenses; Inter uses the SIL Open Font License.

The gradients in Recorder Studio are original generated-in-code presets. No Apple wallpapers or Screen Studio artwork are bundled.

## Local camera background removal

MediaPipe Tasks Vision 1.1.1 and the Google Selfie Segmenter float16 model run locally. The runtime, model URL, SHA-256 and Apache-2.0 text are included in `public/vision/` and copied into the production application. No frames are sent to a segmentation service. Upstream: https://github.com/google-ai-edge/mediapipe .

User-selected Unsplash photos are fetched only on request and stored as a normalized image in the project. No Unsplash API key, API search, account, or bundled third-party wallpaper collection is provided. Users can also import their own PNG/JPEG/WebP images.

## OpenCut Classic timeline snapping

`src/engine/snapping.ts` adapts the nearest-point resolver and 10-pixel zoom-dependent threshold from OpenCut Classic, copyright 2025–2026 OpenCut, MIT. The complete notice is in `THIRD_PARTY_OPENCUT_LICENSE` and ships with the application.

Sources: https://github.com/OpenCut-app/opencut-classic/blob/main/apps/web/src/timeline/snapping/resolve.ts and https://github.com/OpenCut-app/opencut-classic/blob/main/apps/web/src/timeline/snapping/threshold.ts . No OpenCut service, account, or editor runtime is required.
