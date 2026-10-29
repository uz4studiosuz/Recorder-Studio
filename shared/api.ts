import type { CanvasSettings, CursorSettings, TelemetryEvent, ZoomSegment, VideoClip, WebcamShape, WebcamPosition } from './project.js';

export interface MediaAsset { id: string; url: string; name: string }
export interface CaptureTarget { id: string; name: string; kind: 'screen' | 'window'; thumbnail?: string; width?: number; height?: number }
export interface CaptureOptions { region?: { x: number; y: number; width: number; height: number }; keystrokes?: boolean }
export interface CaptureResult { media: MediaAsset; telemetry: TelemetryEvent[]; webcam?: MediaAsset; folder: string }
export interface CaptureStatus { active: boolean; elapsed: number; error?: string; stage?: string; progress?: number; folder?: string }
export interface EditSettings {
  canvas: CanvasSettings; cursor: CursorSettings; zooms: ZoomSegment[];
  trimStart: number; trimEnd: number; speed: number; volume: number;
  clickSounds: boolean; webcamShape: WebcamShape; webcamSize: number;
  webcamPosition: WebcamPosition;
  webcamDodge: boolean;
  /** Corner roundness 0–100 % (circle ignores it), border px, shadow %, horizontal mirror. */
  webcamRoundness?: number; webcamBorder?: number; webcamShadow?: number; webcamMirror?: boolean;
  splitPoints: number[];
  clips?: VideoClip[];
}
export interface SavedProject { version: 1; media: MediaAsset; webcam?: MediaAsset; telemetry: TelemetryEvent[]; settings: EditSettings }
export interface LibraryEntry { id: string; name: string; updatedAt: number; duration: number; thumbnail?: string }
export interface RecorderAPI {
  getAppInfo(): Promise<{ version: string; platform: string }>;
  openMedia(): Promise<MediaAsset | null>;
  browseBackgrounds(): Promise<void>;
  targets(): Promise<CaptureTarget[]>;
  startCapture(targetId: string, options?: CaptureOptions): Promise<void>;
  stopCapture(): Promise<CaptureResult>;
  prepareStop(): Promise<void>;
  cancelCapture(): Promise<void>;
  captureStatus(): Promise<CaptureStatus>;
  revealRecording(): Promise<void>;
  beginTrack(kind: 'audio' | 'webcam'): Promise<void>;
  appendTrack(kind: 'audio' | 'webcam', data: ArrayBuffer): Promise<void>;
  endTrack(kind: 'audio' | 'webcam'): Promise<void>;
  armLoopback(): Promise<void>;
  onStopRequest(callback: () => void): () => void;
  requestStop(): Promise<void>;
  addRecordingMarker(): Promise<void>;
  onEditorShortcut(callback: (command: string) => void): () => void;
  saveProject(project: SavedProject): Promise<boolean>;
  openProject(): Promise<SavedProject | null>;
  /** Writes a portable .rsproject bundle (project + media); returns its path. */
  exportProject(project: SavedProject): Promise<string | null>;
  importProject(): Promise<SavedProject | null>;
  importAnyProject(): Promise<SavedProject | MediaAsset | null>;
  listProjects(): Promise<LibraryEntry[]>;
  saveLibrary(input: { id?: string; project?: SavedProject; settings?: EditSettings; thumbnail?: string }): Promise<LibraryEntry>;
  openLibrary(id: string): Promise<SavedProject>;
  revealExport(): Promise<void>;
  /** Byte access for WebCodecs demuxing of opened media. */
  mediaSize(mediaId: string): Promise<number>;
  readMedia(mediaId: string, offset: number, length: number): Promise<ArrayBuffer>;
  startExport(input: { mediaId: string; format: 'mp4' | 'gif'; width: number; height: number; fps: number; crf?: number; encoder?: 'auto' | 'cpu'; destination?: 'file' | 'clipboard'; settings: EditSettings; telemetry: TelemetryEvent[] }): Promise<{ id: string; encoder: string } | null>;
  exportFrame(id: string, data: ArrayBuffer): Promise<void>;
  finishExport(id: string): Promise<string>;
  cancelExport(id: string): Promise<void>;
}
