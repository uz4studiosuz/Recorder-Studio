import type { CanvasSettings } from '../../shared/project';
import type { EditSettings } from '../../shared/api';
import { clamp } from './motion';
export interface Rect { x: number; y: number; width: number; height: number }
export function splitFrames(width: number, height: number, settings: CanvasSettings) {
  const padding = Math.min(width, height) * settings.padding / 1080, gutter = padding * 0.25;
  const portrait = height > width, share = clamp(settings.splitRatio ?? (portrait ? 0.45 : 0.28), 0.2, 0.6), first = settings.splitSide === 'left';
  const inner = { x: padding, y: padding, width: width - padding * 2, height: height - padding * 2 };
  if (portrait) {
    const cameraHeight = (inner.height - gutter) * share, screenHeight = inner.height - gutter - cameraHeight;
    return { screen: { ...inner, y: first ? padding + cameraHeight + gutter : padding, height: screenHeight }, camera: { ...inner, y: first ? padding : padding + screenHeight + gutter, height: cameraHeight } };
  }
  const cameraWidth = (inner.width - gutter) * share, screenWidth = inner.width - gutter - cameraWidth;
  return { screen: { ...inner, x: first ? padding + cameraWidth + gutter : padding, width: screenWidth }, camera: { ...inner, x: first ? padding : padding + screenWidth + gutter, width: cameraWidth } };
}
export function frameGeometry(width: number, height: number, videoWidth: number, videoHeight: number, settings: CanvasSettings, focus?: { x: number; y: number } | null) {
  const padding = settings.padding * width / 1920, availableWidth = Math.max(1, width - padding * 2), availableHeight = Math.max(1, height - padding * 2);
  if (settings.fitMode === 'fit') {
    const scale = Math.min(availableWidth / videoWidth, availableHeight / videoHeight);
    const fw = videoWidth * scale, fh = videoHeight * scale;
    return { frame: { x: (width - fw) / 2, y: (height - fh) / 2, width: fw, height: fh }, crop: { x: 0, y: 0, width: 1, height: 1 } };
  }
  const ratio = availableWidth / availableHeight, sourceRatio = videoWidth / videoHeight;
  const cw = Math.min(1, ratio / sourceRatio), ch = Math.min(1, sourceRatio / ratio);
  const x = settings.fitMode === 'follow' && focus ? focus.x : settings.cropX;
  const y = settings.fitMode === 'follow' && focus ? focus.y : settings.cropY;
  return { frame: { x: padding, y: padding, width: availableWidth, height: availableHeight }, crop: { x: clamp(x - cw / 2, 0, 1 - cw), y: clamp(y - ch / 2, 0, 1 - ch), width: cw, height: ch } };
}
export const webcamAspect = (shape: EditSettings['webcamShape']) => shape === 'rectangle' ? 16 / 9 : shape === 'rounded' ? 4 / 3 : shape === 'portrait' ? 3 / 4 : 1;
export function webcamRect(width: number, height: number, settings: Pick<EditSettings, 'webcamShape' | 'webcamSize' | 'webcamPosition'>, avoid = 0, strength = 0): Rect {
  const size = Math.min(width, height) * settings.webcamSize / 100 * (1 - strength * 0.18);
  const aspect = webcamAspect(settings.webcamShape), rectWidth = size * aspect;
  const margin = Math.min(width, height) * 0.035, left = margin, right = width - rectWidth - margin, center = (width - rectWidth) / 2;
  const position = settings.webcamPosition ?? 'bottom-right';
  const base = position.endsWith('left') ? left : position.endsWith('center') ? center : right;
  // Avoidance moves the overlay to the opposite side; centered overlays step aside to the right.
  const away = position.endsWith('left') ? right : left;
  return { x: base * (1 - avoid) + (position.endsWith('center') ? right : away) * avoid, y: position.startsWith('top') ? margin : height - size - margin, width: rectWidth, height: size };
}
/** Corner radius for a webcam rectangle; roundness 100 on a square is a circle. */
export function webcamRadius(rect: Rect, roundness = 30) { return clamp(roundness / 100) * Math.min(rect.width, rect.height) / 2; }
export function proximity(rect: Rect, x: number, y: number) {
  const margin = rect.height * 0.65;
  const distance = Math.hypot(Math.max(rect.x - x, x - rect.x - rect.width, 0), Math.max(rect.y - y, y - rect.y - rect.height, 0));
  const t = clamp(1 - distance / margin); return t * t * (3 - 2 * t);
}
