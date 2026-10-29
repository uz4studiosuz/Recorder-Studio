# Recorder Studio 0.5.1

Free, open-source screen recording and cinematic editing with Electron, React, TypeScript, Tailwind, Radix, Zustand, native pointer telemetry, and FFmpeg.

**[Windows qo‘llanmasi (o‘zbekcha)](WINDOWS_BUILD.md)**

## Run

Node 24 LTS x64 recommended, minimum 22.12.

```powershell
npm ci
npm run setup:win
npm run dev
```

The desktop app starts with two actions: New recording and Import project. Recent projects appear in a thumbnail grid and edits save automatically. Import project accepts a portable .rsproject bundle, project JSON, or video. Each new recording/import creates a separate library entry. Browser mode (`dev:web`) supports editing preview; native recording, project dialogs, and FFmpeg export require Electron.

## Editing

- Fullscreen preview via expand, F, or F11; Escape exits. Separate preview Fit/zoom controls.
- Thumbnail timeline with a draggable playhead and clickable ruler, replacing the seek slider.
- Actual split, edge trim, ripple delete, reorder, undo/redo. Video and audio are joined from retained source ranges in timeline order.
- Clearly outlined selected clips, trim handles, canvas element bounds, and contextual inspector controls.
- Ctrl+B split; Delete remove selection; Ctrl+Z undo; Ctrl+Shift+Z/Ctrl+Y redo; Ctrl +/- timeline zoom; Ctrl+0 fit. Ctrl+wheel zooms the timeline or preview under the pointer.
- Gradients, frame padding/radius/shadow, deterministic cursor smoothing and zoom/pan, project save/open.

## Recording and Reels

Native Windows GDI monitor/window recording requests 60fps with the OS cursor excluded. Global mouse telemetry drives a separate vector cursor and automatic zooms. Finish through the floating HUD or Ctrl+Shift+F9.

The source picker includes real source thumbnails and preview, optional microphone/camera selectors, system audio, and per-device errors. If an optional device is missing, denied, or busy, an explicit Continue with available inputs step lets the user proceed with supported devices. Webcam recording has VP9/VP8 fallback. The supporting display stream stays alive for Windows loopback audio.

Reels modes:

1. **Reels region:** drag/size a 9:16 area on the source preview; only that area is saved.
2. **Reels follow:** record the full source, then render a filled portrait crop following recorded cursor movement.
3. **Existing video:** choose 9:16 and Fill frame, then adjust crop focus. Complete-video Fit stays available.

Portrait export offers 720x1280, 1080x1920, and 2160x3840. Preview safe-area guides are not burned into export. Cropping makes a selected region readable; it cannot show every part of a wide desktop at full text size simultaneously.

Webcam overlays support circle, squircle, rounded 4:3, and wide 16:9, plus corner/size controls. Smooth cursor avoidance is deterministic for exported telemetry; preview hover also moves the overlay without altering the recording.

## Build and verify

```powershell
npm test
npm run build
npm run test:desktop
npm run dist:win
```

Also available: `dist:portable`, `pack:win`, and `setup:win`.

`test:integration` makes short real local screen/window/portrait-region recordings and tests synthetic audio/webcam, MP4/GIF, true cut-and-join A/V, Reels export, and cancellation. Files stay in `.integration/`. Run it only when the screen is ready for a local recording.

MP4 uses H.264 at 24/30/60fps with AAC and optional click taps; GIF supports 15/20/30fps and is limited to 60 seconds. The export dialog includes 720p/1080p/4K, real CRF compression presets/custom quality, and file/clipboard destinations. Frames use the same canvas compositor as preview and stream with bounded writes to FFmpeg. Export may run slower than real time.

## Limits and licensing

This is a single-source editor with multiple retained/reordered ranges, not a general multi-source multitrack NLE. Imported media keeps any embedded cursor. MOV depends on codec; GDI may not capture protected/GPU surfaces. Physical audio/camera hardware, mixed-DPI setups, long recordings, and macOS still need manual verification. The Windows installer is unsigned. macOS monitor capture has an untested adapter; macOS window capture is unavailable.

[Verification](docs/verification.md) · [Architecture](docs/architecture.md) · [Third-party notices](THIRD_PARTY.md)

App code is MIT; separately bundled FFmpeg is GPLv3. No proprietary wallpapers are included.

## New in 0.3

- Screen only, full camera, split screen, camera overlay, and local person cutout. Camera compositions require a recorded webcam track; the screen and camera remain separate for later editing. Portrait split stacks screen above camera.
- Gradient, solid-color, local PNG/JPEG/WebP backgrounds, and user-selected Unsplash image URLs. Selected images are normalized and embedded in saved project files; large photos are not put into localStorage. Browsing Unsplash opens the official site. API search and hosted share links are not implemented.
- Offline MediaPipe cutout; matching WASM and person model ship in `public/vision/`. No video frames are uploaded. Edges depend on lighting and clothing/background contrast.
- Fixed inspector heading/tabs with one independently scrolling panel. App chrome does not accidentally select text; inputs, errors, and output paths remain selectable.
- Recording shortcuts: Ctrl+Shift+F9 finish; Ctrl+Shift+M add a zoom marker at the pointer inside the source; Ctrl+Shift+H hide/show the recording bar.
- Clipboard export places a real file reference on the OS clipboard. The backing file stays in Videos/Recorder Studio/Exports. The receiving app must accept pasted files.

## New in 0.4

Before Start, the selected camera is live in the composition preview and the microphone has an input meter. The screen portion is explicitly a source snapshot; Refresh updates it. Preview streams are cloned into recording so a USB camera is not opened twice. Changing devices, turning inputs off or closing the dialog releases the preview tracks.

Stop immediately freezes the screen and restores the app. A busy overlay reports chunk flushing, screen finalization, audio joining and webcam preparation, with elapsed waiting time and available per-step progress. File conversion is capped to screen duration, has deadlines and cancellation, and retains raw files for recovery. Open recording folder and Keep raw files & stop processing remain available while saving.

Timeline snapping adapts OpenCut Classic's MIT nearest-point/10px threshold. S toggles snapping; Up/Down navigate cuts; right-click opens clip actions. Full source attribution and license are included.


## New in 0.5

- A full-page recording workspace with live camera composition, camera size/style/position, backgrounds, microphone meter and a five-second record/listen test before Start. Screen preview remains a labelled snapshot, refreshed with the source list.
- A local project library with separate IDs, thumbnails and automatic settings saves. Library files are under the app user-data `projects` directory; media stays at its original recording/import location. Use Export project for a portable bundle before moving media to another computer.
- Timeline playback follows an independent project clock; delayed decoder events cannot reset the playhead. A second decoder prepares the next retained clip. Scrub/resume and cut transitions have native regression coverage.
- Contextual inspector tabs; clicking empty workspace or pressing Escape clears element selection. Split panes fill equal-height areas in landscape, or stack at equal width in portrait, with adjustable camera share/side.
- Pre-recording composition preferences survive Stop; preview and export use the same compositor and per-clip appearance assets. Reels camera shapes use consistent proportional sizing.
- Export reports the actual decoder, encoder and render rate; working NVENC/QSV/AMF encoders are selected automatically with CPU fallback. Raw RGBA frames stream through bounded writes. Recording audio muxing and camera preparation now run concurrently; speed still depends on hardware, resolution and cutout use.
- Successful file export offers Open Folder. Click sounds include a synthesized chalkboard-style scrape during recorded pointer drags, in preview and MP4; telemetry is required.


## Fixed in 0.5.1

Media playback now receives proper byte-range responses (206, Content-Range, Content-Length and Accept-Ranges). The previous file-fetch wrapper returned partial bytes with a 200 response and no range metadata, which made Chromium clamp seeks back to zero. This caused stale paused frames and blank/incorrect video after clip boundaries.

Preview keeps a single video/audio decoder through ordinary splits. Removed/reordered intervals perform an abortable seek, wait for the new screen/webcam frame, then resume the project clock. A pending frame preserves the last valid canvas instead of replacing it with background. Rapid scrubs discard older requests. New recording is available on Home only.

`npm run test:playback` verifies actual red/green/blue frame pixels while paused, webcam time alignment, continuous and gap cuts, PCM audio after cuts and scrub/resume, HTTP range metadata and latest-request-wins behavior. It uses synthetic fixtures, hides the test window and silences the analysis output; it does not record the screen.
