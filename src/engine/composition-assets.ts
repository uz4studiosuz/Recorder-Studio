import type { ImageSegmenter } from '@mediapipe/tasks-vision';
import type { CanvasSettings } from '../../shared/project';

let segmenter: ImageSegmenter | undefined;
let loading: Promise<void> | undefined;
let revision = 0;
const images = new Map<string, HTMLImageElement>();
export const compositionRevision = () => revision;
export function backgroundImage(settings: CanvasSettings) { return settings.backgroundImage ? images.get(settings.backgroundImage) : undefined; }
export async function prepareComposition(settings: CanvasSettings) {
  if (settings.backgroundType === 'image' && settings.backgroundImage && !images.has(settings.backgroundImage)) {
    const image = new Image(); image.src = settings.backgroundImage;
    await image.decode(); images.set(settings.backgroundImage, image); revision++;
    // Keep the current photo and a few undo steps, rather than every imported image.
    if (images.size > 6) images.delete(images.keys().next().value!);
  }
  if (settings.layout === 'cutout') {
    loading ??= (async () => {
      const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
      const base = new URL('vision/', document.baseURI).href;
      const files = await FilesetResolver.forVisionTasks(base);
      segmenter = await ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${base}selfie_segmenter.tflite`, delegate: 'CPU' },
        runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
      });
      revision++;
    })().catch(error => { loading = undefined; throw error; });
    await loading;
  }
}
export type FrameSource = HTMLVideoElement | HTMLCanvasElement | VideoFrame | ImageBitmap;
export function frameSize(frame: FrameSource) {
  if (frame instanceof HTMLVideoElement) return { width: frame.videoWidth, height: frame.videoHeight };
  if (typeof VideoFrame !== 'undefined' && frame instanceof VideoFrame) return { width: frame.displayWidth, height: frame.displayHeight };
  return { width: (frame as HTMLCanvasElement | ImageBitmap).width, height: (frame as HTMLCanvasElement | ImageBitmap).height };
}
/** Person segmentation; `key` (the frame time) lets repeated draws of the same frame reuse the mask. */
export function createCutout() {
  const input = document.createElement('canvas'), mask = document.createElement('canvas'), output = document.createElement('canvas');
  let previousKey = -1;
  return (frame: FrameSource, key: number) => {
    if (!segmenter) return null;
    if (previousKey === key && output.width > 0) return output;
    const { width, height } = frameSize(frame); if (!width || !height) return null;
    previousKey = key;
    const scale = Math.min(1, 640 / Math.max(width, height));
    input.width = Math.max(1, Math.round(width * scale)); input.height = Math.max(1, Math.round(height * scale));
    input.getContext('2d')!.drawImage(frame, 0, 0, input.width, input.height);
    const result = segmenter.segment(input);
    try {
      const confidence = result.confidenceMasks?.[0];
      if (!confidence) throw new Error('The person segmentation model returned no mask.');
      mask.width = confidence.width; mask.height = confidence.height;
      const values = confidence.getAsFloat32Array(), pixels = new ImageData(mask.width, mask.height);
      for (let index = 0; index < values.length; index++) {
        const alpha = Math.max(0, Math.min(1, (values[index] - 0.2) / 0.6));
        pixels.data[index * 4] = pixels.data[index * 4 + 1] = pixels.data[index * 4 + 2] = 255;
        pixels.data[index * 4 + 3] = Math.round(alpha * alpha * (3 - 2 * alpha) * 255);
      }
      mask.getContext('2d')!.putImageData(pixels, 0, 0);
      output.width = input.width; output.height = input.height;
      const context = output.getContext('2d')!;
      context.drawImage(input, 0, 0); context.globalCompositeOperation = 'destination-in';
      // A slight blur feathers the mask edge instead of leaving jagged hair and shoulders.
      context.filter = `blur(${Math.max(1, output.width / 400)}px)`;
      context.drawImage(mask, 0, 0, output.width, output.height);
      context.filter = 'none'; context.globalCompositeOperation = 'source-over';
      return output;
    } finally { result.close(); }
  };
}
