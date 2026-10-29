import type { CaptureOptions } from '../../shared/api';
export type Region = NonNullable<CaptureOptions['region']>;
export function portraitRegion(width: number, height: number, scale = 1): Region {
  const cropWidth = Math.min(width, height * 9 / 16) * scale;
  const cropHeight = cropWidth * 16 / 9;
  return { x: (1 - cropWidth / width) / 2, y: (1 - cropHeight / height) / 2, width: cropWidth / width, height: cropHeight / height };
}
export function moveRegion(region: Region, x: number, y: number): Region {
  return { ...region, x: Math.max(0, Math.min(1 - region.width, x)), y: Math.max(0, Math.min(1 - region.height, y)) };
}
