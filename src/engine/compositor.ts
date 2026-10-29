import type { EditSettings } from '../../shared/api';
import type { BackgroundId, CursorSettings, TelemetryEvent } from '../../shared/project';
import { settingsAt } from '../../shared/timeline';
import { cameraAt, smoothPointer, clamp } from './motion';
import { frameGeometry, splitFrames, webcamRect, webcamRadius, proximity, type Rect } from './framing';
import { backgroundImage, createCutout, frameSize, type FrameSource } from './composition-assets';
import { bubbleAt, keystrokeBubbles } from './keystrokes';
const palettes: Record<BackgroundId, string[]> = {
  sonoma: ['#9976bb', '#f8bd88', '#b1b4ec'], dusk: ['#392d66', '#e9a270', '#ad5873'],
  ocean: ['#203a82', '#84ddd0', '#82b2dc'], peach: ['#db7197', '#f9b69e', '#fff3c0'],
  forest: ['#203f48', '#b6c697', '#6baba0'], graphite: ['#202127', '#50525d', '#32333a'],
};
export function outputSize(ratio: string, width = 1920) {
  const [x, y] = ratio.split(':').map(Number);
  return x >= y ? { width, height: Math.round(width * y / x / 2) * 2 } : { width: Math.round(width * x / y / 2) * 2, height: width };
}
const arrowPath = 'M0 0 L0 27 L7 20 L12 31 L17 29 L12 18 L23 18 Z';
const handPath = 'M5 23 L1 14 Q0 10 3 10 L7 14 L7 2 Q7 -1 10 0 L11 10 L16 10 Q22 10 22 15 L20 26 L8 26 Z';
let paths: Record<string, Path2D> | undefined;
/** Draws the cursor in a 24-unit local space with its hotspot at the origin. */
function drawCursor(context: CanvasRenderingContext2D, style: CursorSettings['style']) {
  paths ??= { arrow: new Path2D(arrowPath), hand: new Path2D(handPath) };
  context.lineJoin = 'round'; context.lineCap = 'round'; context.shadowColor = '#0008'; context.shadowBlur = 4; context.shadowOffsetY = 1;
  switch (style) {
    case 'arrow-dark': context.fillStyle = '#111114'; context.strokeStyle = '#fff'; context.lineWidth = 1.8; context.fill(paths.arrow); context.stroke(paths.arrow); break;
    case 'pointer': context.translate(-9, 0); context.fillStyle = '#fff'; context.strokeStyle = '#101014'; context.lineWidth = 1.8; context.fill(paths.hand); context.stroke(paths.hand); break;
    case 'text': context.strokeStyle = '#101014'; context.lineWidth = 4; context.beginPath(); context.moveTo(-5, -12); context.lineTo(5, -12); context.moveTo(0, -12); context.lineTo(0, 12); context.moveTo(-5, 12); context.lineTo(5, 12); context.stroke(); context.strokeStyle = '#fff'; context.lineWidth = 2; context.stroke(); break;
    case 'dot': context.fillStyle = '#fff'; context.strokeStyle = '#101014'; context.lineWidth = 1.6; context.beginPath(); context.arc(0, 0, 7, 0, Math.PI * 2); context.fill(); context.stroke(); break;
    case 'ring': context.strokeStyle = '#fff'; context.lineWidth = 3; context.beginPath(); context.arc(0, 0, 13, 0, Math.PI * 2); context.stroke(); context.shadowBlur = 0; context.fillStyle = '#fff'; context.beginPath(); context.arc(0, 0, 2.6, 0, Math.PI * 2); context.fill(); break;
    case 'touch': context.fillStyle = 'rgba(255,255,255,0.38)'; context.strokeStyle = 'rgba(255,255,255,0.9)'; context.lineWidth = 2; context.beginPath(); context.arc(0, 0, 17, 0, Math.PI * 2); context.fill(); context.stroke(); break;
    case 'crosshair': context.strokeStyle = '#101014'; context.lineWidth = 4; context.beginPath(); context.moveTo(-12, 0); context.lineTo(-4, 0); context.moveTo(4, 0); context.lineTo(12, 0); context.moveTo(0, -12); context.lineTo(0, -4); context.moveTo(0, 4); context.lineTo(0, 12); context.stroke(); context.strokeStyle = '#fff'; context.lineWidth = 2; context.stroke(); break;
    default: context.fillStyle = '#fff'; context.strokeStyle = '#101014'; context.lineWidth = 1.8; context.fill(paths.arrow); context.stroke(paths.arrow);
  }
}
/** Draws an image covering (or containing) a rectangle; `anchorY` 0 = top, 1 = bottom. */
function drawImageIn(context: CanvasRenderingContext2D, image: FrameSource, rect: Rect, mode: 'cover' | 'contain', anchorY: number, mirror: boolean) {
  const { width: iw, height: ih } = frameSize(image); if (!iw || !ih) return;
  const scale = (mode === 'contain' ? Math.min : Math.max)(rect.width / iw, rect.height / ih);
  const dw = iw * scale, dh = ih * scale, dx = rect.x + (rect.width - dw) / 2, dy = rect.y + (rect.height - dh) * anchorY;
  if (!mirror) { context.drawImage(image, dx, dy, dw, dh); return; }
  context.save(); context.translate(dx + dw, dy); context.scale(-1, 1); context.drawImage(image, 0, 0, dw, dh); context.restore();
}
function keycap(context: CanvasRenderingContext2D, label: string, x: number, y: number, height: number) {
  const width = Math.max(height, context.measureText(label).width + height * 0.7);
  context.fillStyle = 'rgba(255,255,255,0.14)'; context.beginPath(); context.roundRect(x, y, width, height, height * 0.24); context.fill();
  context.fillStyle = '#fff'; context.fillText(label, x + width / 2, y + height / 2 + 1);
  return width;
}
export function createCompositor(events: TelemetryEvent[], smoothing: number) {
  const pointers = new Map<number, ReturnType<typeof smoothPointer>>();
  // Key events carry no pointer position.
  const motion = events.filter(e => e.kind !== 'key');
  const pointerFor = (value: number) => { let fn = pointers.get(value); if (!fn) { fn = smoothPointer(motion, value); pointers.set(value, fn); } return fn; };
  pointerFor(smoothing);
  const follow = smoothPointer(motion, 100);
  const clicks = events.filter(e => e.kind === 'mousedown');
  const bubbles = { shortcuts: keystrokeBubbles(events, 'shortcuts'), all: keystrokeBubbles(events, 'all') };
  const lastClick = (time: number) => {
    let lo = 0, hi = clicks.length - 1, found = -1; const ms = time * 1000;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (clicks[mid].timeMs <= ms) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    return found;
  };
  const cutout = createCutout();
  let background: HTMLCanvasElement | null = null;
  let backgroundKey = '';
  return function draw(canvas: HTMLCanvasElement, video: FrameSource, webcam: FrameSource | null, time: number, projectSettings: EditSettings, interaction?: { hoverAvoid: number }) {
    const settings = settingsAt(projectSettings, time);
    const context = canvas.getContext('2d', { alpha: false })!;
    const w = canvas.width, h = canvas.height, u = w / 1920, unit = Math.min(w, h) / 1080;
    const photo = backgroundImage(settings.canvas);
    const key = `${w}:${h}:${settings.canvas.background}:${settings.canvas.backgroundType}:${settings.canvas.backgroundColor}:${photo?.src ?? ''}`;
    if (key !== backgroundKey) {
      background = document.createElement('canvas'); background.width = w; background.height = h;
      const c = background.getContext('2d')!; const colors = palettes[settings.canvas.background] ?? palettes.sonoma;
      c.fillStyle = colors[0]; c.fillRect(0, 0, w, h);
      for (const [x, y, color] of [[0, 1, colors[1]], [1, 0, colors[2]]] as const) {
        const gradient = c.createRadialGradient(w * x, h * y, 0, w * x, h * y, Math.max(w, h));
        gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent'); c.fillStyle = gradient; c.fillRect(0, 0, w, h);
      }
      if (settings.canvas.backgroundType === 'color') { c.fillStyle = settings.canvas.backgroundColor ?? '#242430'; c.fillRect(0, 0, w, h); }
      if (settings.canvas.backgroundType === 'image' && photo) {
        const scale = Math.max(w / photo.width, h / photo.height);
        c.drawImage(photo, (w - photo.width * scale) / 2, (h - photo.height * scale) / 2, photo.width * scale, photo.height * scale);
      }
      backgroundKey = key;
    }
    context.drawImage(background!, 0, 0);
    const { width: sourceWidth, height: sourceHeight } = frameSize(video);
    if (!sourceWidth || !sourceHeight || video instanceof HTMLVideoElement && video.readyState < 2) return;
    const webcamReady = !!webcam && (!(webcam instanceof HTMLVideoElement) || webcam.readyState >= 2 && webcam.videoWidth > 0);
    const mode = webcam ? settings.canvas.layout ?? 'overlay' : 'screen';
    const split = mode === 'split';
    const gap = Math.min(w, h) * settings.canvas.padding / 1080;
    const splitAreas = splitFrames(w, h, settings.canvas);
    const area = split ? splitAreas.screen : { x: 0, y: 0, width: w, height: h };
    const frameCanvas = (width: number) => ({ ...settings.canvas, padding: gap * 1920 / width });
    const local = frameGeometry(area.width, area.height, sourceWidth, sourceHeight, split ? { ...settings.canvas, padding: 0, fitMode: 'fill' } : frameCanvas(area.width), follow(time));
    const geometry = { frame: { ...local.frame, x: local.frame.x + area.x, y: local.frame.y + area.y }, crop: local.crop };
    const { frame, crop } = geometry;
    const { width: fw, height: fh, x: fx, y: fy } = frame;
    const mapCamera = (sampleTime: number) => {
      const camera = cameraAt(settings.zooms, sampleTime);
      return { ...camera, x: clamp((camera.x - crop.x) / crop.width, 0.5 / camera.scale, 1 - 0.5 / camera.scale), y: clamp((camera.y - crop.y) / crop.height, 0.5 / camera.scale, 1 - 0.5 / camera.scale) };
    };
    const drawVideo = () => context.drawImage(video, crop.x * sourceWidth, crop.y * sourceHeight, crop.width * sourceWidth, crop.height * sourceHeight, 0, 0, fw, fh);
    const radius = Math.min(settings.canvas.radius * unit, fw / 2, fh / 2);
    const pointer = pointerFor(settings.cursor.smoothing);
    context.save(); if (mode === 'camera') { context.beginPath(); context.rect(0, 0, 0, 0); context.clip(); }
    context.save(); context.shadowColor = `rgba(0,0,0,${settings.canvas.shadow / 140})`; context.shadowBlur = settings.canvas.shadow * u; context.shadowOffsetY = settings.canvas.shadow * u / 3;
    context.fillStyle = '#16161a'; context.beginPath(); context.roundRect(fx, fy, fw, fh, radius); context.fill(); context.restore();
    context.save(); context.beginPath(); context.roundRect(fx, fy, fw, fh, radius); context.clip();
    const camera = mapCamera(time);
    if (settings.canvas.motionBlur) {
      const previous = mapCamera(Math.max(0, time - 1 / 120));
      if (Math.abs(previous.scale - camera.scale) > 0.002 || Math.abs(previous.x - camera.x) > 0.002 || Math.abs(previous.y - camera.y) > 0.002) {
        for (const amount of [1, 0.5]) {
          const sample = mapCamera(Math.max(0, time - amount / 120));
          context.save(); context.translate(fx + fw / 2 - sample.x * fw * sample.scale, fy + fh / 2 - sample.y * fh * sample.scale); context.scale(sample.scale, sample.scale);
          context.globalAlpha = 0.25; drawVideo(); context.restore();
        }
        context.globalAlpha = 0.75;
      }
    }
    const tx = fx + fw / 2 - camera.x * fw * camera.scale, ty = fy + fh / 2 - camera.y * fh * camera.scale;
    context.translate(tx, ty); context.scale(camera.scale, camera.scale);
    drawVideo(); context.globalAlpha = 1;
    const point = pointer(time);
    if (point && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 && (!settings.cursor.hideWhenIdle || point.idle < 1500)) {
      const px = (point.x - crop.x) / crop.width * fw, py = (point.y - crop.y) / crop.height * fh;
      const idleFade = settings.cursor.hideWhenIdle ? clamp((1500 - point.idle) / 300) : 1;
      const last = lastClick(time);
      if (settings.cursor.ripple) {
        for (let index = last; index >= 0 && time - clicks[index].timeMs / 1000 <= 0.5; index--) {
          const click = clicks[index], age = time - click.timeMs / 1000;
          context.strokeStyle = `rgba(255,255,255,${(1 - age * 2) * 0.9})`; context.lineWidth = 2.5 * u;
          context.beginPath(); context.arc((click.x - crop.x) / crop.width * fw, (click.y - crop.y) / crop.height * fh, (10 + age * 60) * u, 0, Math.PI * 2); context.stroke();
        }
      }
      const age = last >= 0 ? time - clicks[last].timeMs / 1000 : Infinity;
      const pulse = settings.cursor.clickPulse && age < 0.3 ? 1 - 0.2 * Math.sin(Math.PI * age / 0.3) : 1;
      const scale = settings.cursor.size * u / 24 * pulse;
      context.save(); context.globalAlpha = idleFade; context.translate(px, py);
      if (settings.cursor.highlight) { context.fillStyle = 'rgba(255,214,10,0.30)'; context.beginPath(); context.arc(0, 0, 30 * settings.cursor.size * u / 24, 0, Math.PI * 2); context.fill(); }
      context.scale(scale, scale); drawCursor(context, settings.cursor.style);
      context.restore();
    }
    context.restore();
    context.strokeStyle = '#ffffff28'; context.lineWidth = u; context.beginPath(); context.roundRect(fx, fy, fw, fh, radius); context.stroke();
    context.restore();
    let overlay: Rect | undefined;
    if (mode !== 'screen' && webcam && webcamReady) {
      const base = webcamRect(w, h, settings);
      let avoid = 0;
      if (settings.webcamDodge && mode === 'overlay') {
        let total = 0;
        for (let index = 0; index < 18; index++) {
          const t = Math.max(0, time - index / 45), p = pointer(t), weight = Math.exp(-index / 5); total += weight;
          if (!p || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
          const g = frameGeometry(w, h, sourceWidth, sourceHeight, frameCanvas(w), follow(t));
          const cam = cameraAt(settings.zooms, t), cx = clamp((cam.x - g.crop.x) / g.crop.width, 0.5 / cam.scale, 1 - 0.5 / cam.scale), cy = clamp((cam.y - g.crop.y) / g.crop.height, 0.5 / cam.scale, 1 - 0.5 / cam.scale);
          const px = g.frame.x + g.frame.width / 2 + ((p.x - g.crop.x) / g.crop.width - cx) * g.frame.width * cam.scale;
          const py = g.frame.y + g.frame.height / 2 + ((p.y - g.crop.y) / g.crop.height - cy) * g.frame.height * cam.scale;
          avoid += proximity(base, px, py) * weight;
        }
        avoid /= total;
        avoid = Math.max(avoid, interaction?.hoverAvoid ?? 0);
      }
      const mirror = !!settings.webcamMirror;
      if (mode === 'cutout') {
        // The cut-out person stands on the bottom edge, large enough to read as a presenter.
        const height = h * clamp(settings.webcamSize * 2.2, 25, 95) / 100, width = Math.min(w * 0.96, height * 0.9);
        const position = settings.webcamPosition ?? 'bottom-right';
        const x = position.endsWith('left') ? w * 0.02 : position.endsWith('center') ? (w - width) / 2 : w - width - w * 0.02;
        overlay = { x, y: h - height, width, height };
        const image = cutout(webcam, time);
        if (image) {
          context.save(); context.shadowColor = `rgba(0,0,0,${(settings.webcamShadow ?? 40) / 110})`; context.shadowBlur = 40 * unit * (settings.webcamShadow ?? 40) / 50; context.shadowOffsetY = 8 * unit;
          drawImageIn(context, image, overlay, 'contain', 1, mirror); context.restore();
        }
      } else {
        overlay = webcamRect(w, h, settings, avoid, camera.strength);
        if (mode === 'camera') overlay = { x: gap, y: gap, width: w - gap * 2, height: h - gap * 2 };
        if (split) overlay = splitAreas.camera;
        const { x, y, width, height } = overlay;
        const r = mode === 'overlay' ? settings.webcamShape === 'circle' ? Math.min(width, height) / 2 : webcamRadius(overlay, settings.webcamRoundness ?? 30) : Math.min(settings.canvas.radius * unit, width / 2, height / 2);
        const shadow = (settings.webcamShadow ?? 40) / 100;
        if (shadow > 0) { context.save(); context.shadowColor = `rgba(0,0,0,${shadow * 0.6})`; context.shadowBlur = 50 * unit * shadow; context.shadowOffsetY = 12 * unit * shadow; context.fillStyle = '#16161a'; context.beginPath(); context.roundRect(x, y, width, height, r); context.fill(); context.restore(); }
        context.save(); context.beginPath(); context.roundRect(x, y, width, height, r); context.clip();
        context.fillStyle = '#16161a'; context.fillRect(x, y, width, height);
        drawImageIn(context, webcam, overlay, 'cover', 0.4, mirror);
        context.restore();
        const border = (settings.webcamBorder ?? 0) * unit;
        if (border > 0) { context.strokeStyle = 'rgba(255,255,255,0.92)'; context.lineWidth = border; context.beginPath(); context.roundRect(x + border / 2, y + border / 2, width - border, height - border, Math.max(0, r - border / 2)); context.stroke(); }
      }
    }
    if (settings.cursor.keystrokes) {
      const bubble = bubbleAt(bubbles[settings.cursor.keystrokeMode ?? 'shortcuts'], time);
      if (bubble && bubble.text.trim()) {
        const size = 34 * unit, padX = size * 0.55, height = size * 1.9;
        context.save(); context.globalAlpha = bubble.opacity;
        context.font = `600 ${size}px Inter, "Segoe UI", system-ui, sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle';
        const parts = bubble.kind === 'combo' ? bubble.text.split('+') : [bubble.text];
        const capHeight = height - size * 0.6, spacing = size * 0.25;
        const widths = bubble.kind === 'combo' ? parts.map(part => Math.max(capHeight, context.measureText(part).width + capHeight * 0.7)) : [context.measureText(bubble.text).width];
        const content = widths.reduce((sum, value) => sum + value, 0) + spacing * (widths.length - 1);
        const boxWidth = content + padX * 2, bx = (w - boxWidth) / 2, by = h - height - 56 * unit + (1 - bubble.pop) * 12 * unit;
        context.shadowColor = 'rgba(0,0,0,0.35)'; context.shadowBlur = 30 * unit; context.shadowOffsetY = 8 * unit;
        context.fillStyle = 'rgba(28,28,32,0.82)'; context.beginPath(); context.roundRect(bx, by, boxWidth, height, height * 0.32); context.fill();
        context.shadowColor = 'transparent'; context.strokeStyle = 'rgba(255,255,255,0.12)'; context.lineWidth = Math.max(1, unit); context.stroke();
        if (bubble.kind === 'combo') { let cx = bx + padX; for (const part of parts) cx += keycap(context, part, cx, by + (height - capHeight) / 2, capHeight) + spacing; }
        else { context.fillStyle = '#fff'; context.fillText(bubble.text, w / 2, by + height / 2 + 1); }
        context.restore();
      }
    }
    return { ...geometry, camera, webcam: overlay };
  };
}
