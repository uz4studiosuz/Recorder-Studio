export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3';
export type BackgroundId = 'sonoma' | 'dusk' | 'ocean' | 'peach' | 'forest' | 'graphite';
export type Layout = 'screen' | 'camera' | 'split' | 'overlay' | 'cutout';
export interface CanvasSettings {
  aspectRatio: AspectRatio;
  background: BackgroundId;
  padding: number;
  radius: number;
  shadow: number;
  motionBlur: boolean;
  fitMode: 'fit' | 'fill' | 'follow';
  cropX: number;
  cropY: number;
  layout?: Layout;
  backgroundType?: 'gradient' | 'color' | 'image';
  backgroundColor?: string;
  backgroundImage?: string;
  /** Camera share of the canvas in split layout, 0.2–0.5. */
  splitRatio?: number;
  splitSide?: 'right' | 'left';
}
export const cursorStyles = ['arrow', 'arrow-dark', 'pointer', 'text', 'dot', 'ring', 'touch', 'crosshair'] as const;
export type CursorStyle = typeof cursorStyles[number];
export interface CursorSettings {
  size: number;
  smoothing: number;
  ripple: boolean;
  hideWhenIdle: boolean;
  style: CursorStyle;
  /** Shrink the cursor briefly on click. */
  clickPulse?: boolean;
  /** Soft halo around the cursor. */
  highlight?: boolean;
  /** Draw recorded keystrokes / shortcuts on the canvas. */
  keystrokes?: boolean;
  keystrokeMode?: 'shortcuts' | 'all';
}
export const webcamShapes = ['circle', 'squircle', 'rounded', 'rectangle', 'portrait'] as const;
export type WebcamShape = typeof webcamShapes[number];
export type WebcamPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'bottom-center' | 'top-center';
/** All project times are seconds; telemetry timestamps are milliseconds from capture start. */
export interface ZoomSegment {
  id: string; startTime: number; endTime: number;
  targetX: number; targetY: number; zoomScale: number;
  keyframes?: { time: number; x: number; y: number }[];
}
export interface TelemetryEvent {
  timeMs: number; x: number; y: number; kind: 'move' | 'mousedown' | 'mouseup' | 'marker' | 'key';
  /** Key label for kind 'key', e.g. "Ctrl+Shift+S" or "A". */
  key?: string;
}
/** Look settings that a single clip may override. Aspect ratio stays project-wide. */
export interface ClipLook {
  canvas?: Partial<Omit<CanvasSettings, 'aspectRatio'>>;
  cursor?: Partial<CursorSettings>;
  webcamShape?: WebcamShape; webcamSize?: number; webcamPosition?: WebcamPosition; webcamDodge?: boolean;
  webcamRoundness?: number; webcamBorder?: number; webcamShadow?: number; webcamMirror?: boolean;
  volume?: number;
}
export interface VideoClip { id: string; start: number; end: number; look?: ClipLook }
