# Recorder Studio 0.5.1 verification

Validated on Windows x64, 2026-10-28: Node 24.18.0, npm 11.16.0, Electron 45.0.0, Vite 8.3.5, FFmpeg 6.1.1.

## Checks

- Production TypeScript and Vite/Electron builds pass. Person segmentation code loads as a separate lazy chunk.
- 40 unit tests across fourteen files pass: source lifecycle, editing/history, deterministic motion, timeline mapping, framing/regions, optional-device failures and IPC settings validation.
- Desktop smoke: production home menu renders, real sandboxed preload IPC works, renderer Node access is disabled.
- Integration exports H.264/AAC and GIF, cut/reorder/trim audio mapping, Reels and export cancellation. A 0.5-second 60 FPS render contains exactly 30 frames; retained-cut output contains 60 frames.
- Five compositions produce distinct real frames. A Google MediaPipe portrait fixture has 138,538 near-transparent and 142,599 near-opaque mask pixels after local inference. Cutout also goes through a real 24 FPS/CRF26 export. Fixtures are test-only and excluded from the app.
- An initial-decoder regression was found by inspecting render artifacts: loadeddata could precede canvas-readable video pixels. Priming with an accurate seek fixes it; integration asserts a nonblank initial screen frame.
- Actual short monitor, 9:16 region and stable test-window captures pass. Synthesized webcam/audio travel through the real MediaRecorder and native mux path. A manually inserted recording marker survives telemetry finalization.
- 4K/24 FPS and clipboard file export are included in the integration suite. Clipboard checks require the native Windows CF_HDROP format. The harness snapshots clipboard payloads into writable ClipboardItems before testing and restores them afterward.
- Background photos are embedded into saved projects; preference persistence excludes large image data. Inspector tabs stay outside the scrolling content. These targeted UI changes are code-checked; current browser visual QA was blocked by the browser tool URL policy. Earlier 0.2 browser checks covered home/import, cut/delete/undo, Ctrl +/- and fullscreen/Reels.

- Packaged 0.5.0 diagnostic exited 0: packaged=true, hook=true, Koffi3.3.3, FFmpeg=true, modelPixels=4096, app version0.5.0/win32. This runs a real bundled-model inference from app.asar with no screen capture. One Chromium disk-cache warning did not prevent the check.
- Fractional-duration exports are rounded to complete frames. The suite decodes every output and verifies 30 MP4 / 10 GIF / 60 cut / 60 Reels / 6 cutout / 2 short 4K frames, preventing last-frame loss at 24 FPS.

## Output

- release/Recorder-Studio-Setup-0.5.1-x64.exe
- release/Recorder-Studio-Portable-0.5.1-x64.exe
- release/win-unpacked/Recorder Studio.exe (requires the entire folder)
- release/SHA256SUMS.txt
- .integration/results.json and layout-*.png are local ignored test artifacts.

## Manual release validation still needed

Physical camera/microphone and actual Windows loopback, mixed-DPI/multiple monitors, long sessions, protected/GPU surfaces, HUD capture exclusion on other Windows releases, clean-machine installation, code signing, and macOS. The generated installer has not been installed into the user's system. There is no benchmark proving uninterrupted 60 FPS acquisition on all hardware or sample-accurate A/V/telemetry synchronization.

This is a single-source editor with retained/reordered ranges. Independent-source multitrack editing, hosted share links, internal Unsplash API search, automatic OS cursor-type detection and macOS window recording are not implemented. Full camera is a composition over separately retained screen/camera recordings.

npm install reports eight moderate dependency advisories in the current lockfile. No zero-vulnerability claim is made. FFmpeg remains separately licensed GPLv3; MediaPipe notices ship with the local model/runtime.

## 0.4 recording finalization regression checks

- MediaRecorder failing to emit stop rejects after its deadline with a recovery message.
- Cancelled track queues do not write into a later recording.
- A live preview camera is cloned and reused rather than opening its device twice; disposing the recording clone leaves the preview-owned track alone.
- Native FFmpeg cancellation and deadline terminate an otherwise unbounded synthetic input.
- Screen capture stops before audio/webcam chunk draining. Real native finalization exposes Finalizing screen recording, Joining screen and audio, and Preparing webcam track stages.
- Final screen/audio and webcam durations match raw screen stop time within 120 ms in the short integration fixture.
- Snapping tests cover zoom-dependent distance, nearest boundary and disabled snapping.

The OBS-like pre-start camera preview and mic meter use the user's selected hardware. Physical USB camera/microphone and long user sessions still require hands-on validation; synthetic track tests do not substitute for those. The screenshot's exact hardware stall was not reproduced, but unbounded waits were removed and tested cancellation/recovery paths were added.


## 0.5 regression coverage

The native renderer fixture mounts the real Preview component with an animated H.264 video, verifies a canvas-readable initial frame, plays across a removed source interval, scrubs while paused and resumes without a reset. Pure clock tests cover minute-scale scrubs, reordered clips and speed changes. Project IPC creates two separate library entries, updates one, reopens both and checks isolation. Split geometry tests assert aligned panes, mirrored sides and resolution scaling. Pointer sound tests cover drag segmentation and bounded deterministic synthesis; integration exports with drag telemetry.

Current UI changes are code-checked and component-tested, not visually inspected in the blocked local browser. Physical webcam/microphone playback tests still need the user's devices. Export throughput observed on this machine's small 640px fixture is not a 1080p/4K benchmark.


The final 0.5 native integration passes after concurrent audio/camera finalization and pending-export-write cancellation changes. Its cut boundary advanced from source 0.3s to the retained 1.5s–2s interval; paused seek to 1.7s resumed there. MP4 used sequential hardware decode and NVENC (75 rendered frames/second on a 640px short fixture). Every output was decoded to verify expected frame counts. Native monitor, portrait region and window capture passed, and finalized screen/webcam duration agreement remained within 120ms. Packaged dependency and bundled-model inference diagnostic passed with version 0.5.0. Physical input devices and clean-machine installer execution remain manual checks.


## 0.5.1 frame/audio regression (2026-10-28)

A new six-second H.264/AAC fixture with red, green and blue sections reproduced the paused-seek bug in 0.5.0. Instrumentation showed a requested time of 3.2 seconds remaining at zero. Its Range request returned only 100 bytes but status 200 and no Content-Range. Explicit 206/length/range responses fixed native seeking.

The new real Preview test passes: correct initial and paused RGB pixels, matching paused webcam timestamp, actual playhead crossing of both adjacent splits and removed intervals, nonzero decoded PCM after each cut and after scrub/resume, and the last of several rapid seeks winning. PCM is measured through an analyser with the output muted; no screen capture is needed for this targeted test. `npm run test:playback` builds and runs it.

Full integration and desktop smoke also pass: MP4/GIF expected frame counts, 4K/Reels/cutout, clipboard restoration, export cancellation, library isolation, native screen/window/portrait capture and synthetic webcam/audio muxing. The composition fixture now primes and attaches both screen and camera decoders before sampling pixels. No new claim of physical microphone/device or clean-machine installer validation is made.


Packaged 0.5.1 diagnostic passed: packaged=true, native hook=true, Koffi=3.3.3, FFmpeg=true, bundled segmentation modelPixels=4096, version=0.5.1/win32. The installer is built from that verified unpacked package.
