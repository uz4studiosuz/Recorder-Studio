# Recorder Studio architecture

## Native boundary

Electron main owns file dialogs, session directories, native capture, telemetry hooks, FFmpeg processes, and export destinations. The renderer is sandboxed with context isolation and Node disabled. A typed preload exposes named IPC operations, with main-frame sender checks, chunk-size limits, settings validation, and asset IDs. There is no arbitrary command or filesystem bridge.

A registered `studio://media/<uuid>` protocol serves only paths registered by native file selection or recorded sessions. Anonymous CORS is enabled for those unguessable local asset URLs so canvas readback works; files never need to be loaded into renderer memory as one large blob. External navigation/popups are denied. Media permissions are scoped to the app's primary renderer and a short user-initiated preparation interval.

## Capture

Windows uses FFmpeg `gdigrab`, `draw_mouse=0`, requested 60fps, H.264 ultrafast capture, and physical monitor geometry. Windows title capture uses unique titles and native client-area geometry via Koffi. Global uiohook mouse events become normalized capture coordinates; movements are rate-limited to 60Hz. Backpressure skips redundant moves and retains clicks. Telemetry is streamed as a JSON array, with an explicit event limit.

The clock is monotonic and starts when FFmpeg reports its input opened. This is an approximation to the first captured frame; hardware-level drift verification remains open. macOS has an AVFoundation monitor adapter and requires Accessibility/Screen Recording permission, but remains untested.

Renderer MediaRecorder streams mixed audio and webcam chunks to main, bounded to avoid unbounded RAM. Original offsets are saved. Finalization remuxes/pads audio into the screen video and pads the webcam start, keeping raw files for recovery. A content-protected always-on-top HUD and global shortcut request stop through the primary renderer so media chunks finish before native capture finalization.

## Time and edits

Source/project edit timestamps are seconds; telemetry uses milliseconds from capture origin. Retained clips partition and reorder source intervals. Shared timeline helpers map source time to output time, applying global speed, trim and retained order. Per-clip appearance overrides merge over project settings. JSON references original media; .rsproject bundles carry media for transfer.

The local library stores each project under a UUID in Electron user-data/projects. Lightweight metadata includes the thumbnail and duration for grid listing. Immutable telemetry lives separately so debounced settings saves do not resend or rewrite large pointer logs. Atomic temporary-file renames protect updates; navigation awaits queued saves.

Automatic zooms group successive clicks at most 1500ms apart. Per-group focus keyframes pan between click locations. Manual focus edits replace that automatic focus path. Segment ramps and camera clamping keep the video frame filled. Cursor critical damping is precomputed at 120Hz; querying any time gives the same result regardless of seek order or render cadence. Long idle gaps hold the pointer before the next movement.

## Compositor and export

A single canvas renderer handles background gradients, media fit, rounded clipping, shadow, camera transforms, vector cursor, ripples, and a webcam that shrinks/dodges the focus. Optional camera blur blends nearby transform samples. Preview skips unchanged paused frames.

Offline export prefers a sequential WebCodecs decoder with an MP4 sample index and falls back to an attached HTML video decoder. Each n/fps timestamp is mapped through retained source ranges and rendered with the common compositor. RGBA frames stream through bounded IPC/native writes with one pending frame; no PNG encode/decode round trip is needed. A working NVENC/QSV/AMF H.264 encoder is chosen per session with libx264 fallback. MP4 supports 24/30/60 FPS and GIF 15/20/30 FPS, with dimensions through 3840. FFmpeg audio filters use the identical cut order/speed and clip volumes. Click taps and chalk-style drag sounds are synthesized into a temporary PCM track at mapped output positions.

Preview uses a monotonic project playback clock. Decoder seek notifications only invalidate the drawn frame and never change the playhead. One video/audio element continues across adjacent split ranges. Removed/reordered intervals pause playback, seek with cancellation and frame-presentation checks, then reset the clock after the target is ready. User seek revisions cancel superseded requests explicitly. Preview/export both prepare per-clip composition assets.

Exports use a uniquely named partial file and rename only on success. Cancellation drains the pending frame, terminates FFmpeg and removes temporary assets. Reveal-export shows only the most recent successful output. Throughput depends on source codec, canvas readback, cutout inference, dimensions and available encoder hardware.

## Packaging and remaining validation

Electron Builder produces NSIS, portable, and unpacked Windows x64 builds. FFmpeg and N-API native modules are unpacked from ASAR. `--verify-install` checks the real packaged dependencies. The installer is unsigned. FFmpeg's GPL license/build notices travel with its executable; corresponding-source distribution remains the distributor's responsibility.

Automated checks cover state, physics, input validation, real Windows screen/window capture, synthetic audio/webcam recording, rendering/exports, cancellation, and native boot. Physical devices, mixed-DPI behavior, long recordings, protected surfaces, macOS permissions and packaging, and signing need separate release validation. Full arbitrary multitrack editing, automatic cursor-type detection, optical-flow blur, and macOS window capture are not implemented.

## 0.3 composition and assets

Canvas settings add an optional layout (screen/camera/split/overlay/cutout) and gradient/color/image backgrounds. Missing fields preserve older project defaults. Background image data is validated and embedded in project JSON; it is deliberately omitted from localStorage preferences. UI chrome disables accidental text selection while preserving editable fields and useful output messages.

The compositor draws the same composition in preview and deterministic frame export. Split uses proportionally sized, filled panes with aligned heights in landscape and aligned widths in portrait. Side and camera share are adjustable. Person cutout uses lazy-loaded MediaPipe Tasks Vision 1.1.1 with a bundled Selfie Segmenter model and matching WASM. A per-compositor mask canvas is refreshed for each decoded camera time; source frames never leave the device. Initial video decoders are primed via seek to make frame zero readable by canvas.

Export accepts validated FPS, dimensions through 3840, compression CRF14–35 and file/clipboard destination. Clipboard output stays in Videos/Recorder Studio/Exports and uses Electron 45 ClipboardItem text/uri-list, which produces Windows CF_HDROP. No upload or hosting service is configured. Global recording shortcuts add source-position markers to telemetry and toggle the content-protected HUD; marker events drive auto-zoom without click sounds or ripples.

## 0.4 preview ownership and stop lifecycle

useLiveInput owns permission-scoped preview tracks. prepareCapture clones live tracks before awaiting native setup, so preview cleanup cannot stop the recording or open a USB camera twice. Preview requests have a deadline and release late-arriving streams. CapturePreview uses the normal compositor with a canvas of the selected source thumbnail plus a live camera decoder; its caption explicitly distinguishes snapshot screen from live camera.

beginStop freezes GDI capture and detaches telemetry immediately, before renderer writers flush. The app restores at Stop. Native stages/progress are polled through the narrow captureStatus API. MediaRecorder, writes and stream closing have deadlines. FFmpeg jobs accept AbortSignal, an idle watchdog, total deadline and parsed out_time_us progress. Audio padding and webcam encoding are bounded by probed raw-screen duration; webcam uses a fast intermediary H.264 preset. Cancellation preserves files and guards old completions from changing a new session. Reveal-recording opens only the last known recording folder.

OpenCut Classic's nearest-point snapping resolver is adapted with a 10 CSS pixel threshold translated through current timeline scale. Its MIT notice is bundled. No external editor runtime or service is introduced.


## 0.5 recording workspace and finalization

The recording route is a full page; its Inspector and CapturePreview share the settings later loaded into the editor. Camera remains live; screen is a labelled source snapshot. Preview removes old project clip overrides and substitutes a centered fill while no recorded follow telemetry exists. MicrophoneTest uses the existing stream for a bounded five-second MediaRecorder sample with local playback, and stops/releases the sample when recording starts or inputs change.

After raw screen finalization, screen/audio remuxing and independent webcam H.264 preparation run concurrently with aggregate progress. Both settle before registration and editor opening; cancellation and raw-file recovery remain available. This removes serial work without re-encoding the screen track.


## 0.5.1 media range contract

The studio:// protocol reads only registered local paths and serves bounded Node file streams with Content-Length and Accept-Ranges. A valid single Range receives 206 and Content-Range; unsatisfiable or multipart ranges receive 416 with the file size. This replaces net.fetch(file:) wrapping, which preserved a partial body while losing the 206/range metadata needed by Chromium seeking. Unit tests cover explicit, open and suffix ranges and rejected requests. Native renderer regression asserts the actual status, range header and byte count.

Preview waits for metadata and presented seek frames, guards every async step with an AbortSignal, primes new screen/camera sources and holds the existing composition during decoder seeks. The decoder element remains inside the viewport with zero opacity to avoid offscreen presentation suspension. Cut regressions now inspect real composed pixels and PCM audio, not only store timestamps.
