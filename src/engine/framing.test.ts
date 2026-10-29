import { expect, it } from 'vitest';
import { frameGeometry, webcamRect, proximity, splitFrames } from './framing';
import { portraitRegion, moveRegion } from './region';
import { defaultCanvas } from '../store/editor';
import { outputSize } from './compositor';
it('fills a portrait canvas with a source crop instead of a tiny landscape strip', () => {
  const { frame, crop } = frameGeometry(1080, 1920, 1920, 1080, { ...defaultCanvas, padding: 0, fitMode: 'fill' });
  expect(frame).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
  expect(crop.width).toBeCloseTo(81 / 256);
  expect(crop.height).toBe(1);
  const followed = frameGeometry(1080, 1920, 1920, 1080, { ...defaultCanvas, padding: 0, fitMode: 'follow' }, { x: 1, y: 0.5 });
  expect(followed.crop.x + followed.crop.width).toBeCloseTo(1);
});
it('produces the correct HD and Full HD Reels dimensions', () => {
  expect(outputSize('9:16', 1920)).toEqual({ width: 1080, height: 1920 });
  expect(outputSize('9:16', 1280)).toEqual({ width: 720, height: 1280 });
});
it('preserves a draggable 9:16 capture region inside monitor bounds', () => {
  const region = portraitRegion(1920, 1080, 0.8);
  expect(region.width * 1920 / (region.height * 1080)).toBeCloseTo(9 / 16);
  const moved = moveRegion(region, 100, -10);
  expect(moved.x + moved.width).toBeCloseTo(1); expect(moved.y).toBe(0);
});
it('interpolates webcam avoidance between corners and supports wide shapes', () => {
  const settings = { webcamShape: 'circle' as const, webcamPosition: 'bottom-right' as const, webcamSize: 20 };
  const right = webcamRect(1920, 1080, settings, 0), left = webcamRect(1920, 1080, settings, 1), middle = webcamRect(1920, 1080, settings, 0.5);
  expect(middle.x).toBeCloseTo((right.x + left.x) / 2);
  expect(proximity(right, right.x + 10, right.y + 10)).toBe(1);
  expect(proximity(right, 0, 0)).toBe(0);
  const wide = webcamRect(1920, 1080, { ...settings, webcamShape: 'rectangle' });
  expect(wide.width / wide.height).toBeCloseTo(16 / 9);
});

it('aligns split panes and scales their proportions in preview and export', () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920]]) {
    const a = splitFrames(width, height, defaultCanvas), b = splitFrames(width * 2, height * 2, defaultCanvas);
    expect(b.screen.width).toBeCloseTo(a.screen.width * 2); expect(b.camera.height).toBeCloseTo(a.camera.height * 2);
    if (width > height) { expect(a.screen.height).toBe(a.camera.height); expect(a.screen.y).toBe(a.camera.y); expect(a.screen.x + a.screen.width).toBeLessThan(a.camera.x); }
    else { expect(a.screen.width).toBe(a.camera.width); expect(a.screen.x).toBe(a.camera.x); expect(a.screen.y + a.screen.height).toBeLessThan(a.camera.y); }
    const reversed = splitFrames(width, height, { ...defaultCanvas, splitSide: 'left' });
    expect(width > height ? reversed.camera.x < reversed.screen.x : reversed.camera.y < reversed.screen.y).toBe(true);
  }
});
