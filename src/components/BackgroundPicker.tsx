import { useRef, useState } from 'react';
import { useEditor, inspectedSettings } from '../store/editor';

async function normalizedImage(blob: Blob) {
  if (blob.size > 20 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(blob.type)) throw new Error('Choose a PNG, JPEG, or WebP image under 20 MB.');
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 3840 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally { bitmap.close(); }
}
export function BackgroundPicker() {
  const state = useEditor(), { setCanvas, checkpoint } = state, { canvas } = inspectedSettings(state);
  const [url, setUrl] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const choose = async (blob: Blob) => { const image = await normalizedImage(blob); checkpoint(); setCanvas({ backgroundType: 'image', backgroundImage: image }); setMessage('Image saved with this project.'); };
  return <div className="ap-bgpicker"><div className="ap-segmented" role="radiogroup" aria-label="Background type">{(["gradient", "color", "image"] as const).map(type => <button key={type} role="radio" aria-checked={(canvas.backgroundType ?? 'gradient') === type} onClick={() => { checkpoint(); setCanvas({ backgroundType: type }); }}>{type}</button>)}</div>
    {canvas.backgroundType === 'color' && <label className="ap-row">Solid color<input type="color" aria-label="Background color" value={canvas.backgroundColor ?? '#242430'} onPointerDown={checkpoint} onChange={e => setCanvas({ backgroundColor: e.target.value })} /></label>}
    {canvas.backgroundType === 'image' && <><button className="ap-button" onClick={() => input.current?.click()} disabled={busy}>Choose image from computer</button><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); try { await choose(file); } catch (error) { setMessage(String(error)); } finally { setBusy(false); e.target.value = ''; } }} />
      {canvas.backgroundImage && <img className="background-thumbnail" src={canvas.backgroundImage} alt="Selected canvas background" />}
      <button className="ap-button" onClick={() => { if (window.recorder) void window.recorder.browseBackgrounds(); else window.open('https://unsplash.com/wallpapers', '_blank', 'noopener'); }}>Browse Unsplash photos ↗</button>
      <label className="ap-field">Unsplash image URL<input aria-label="Unsplash image URL" type="url" placeholder="https://images.unsplash.com/photo-…" value={url} onChange={e => setUrl(e.target.value)} /></label><button className="ap-button" disabled={busy || !url} onClick={async () => { setBusy(true); setMessage('Downloading image…'); try {
        const address = new URL(url); if (address.protocol !== 'https:' || address.hostname !== 'images.unsplash.com' || !address.pathname.startsWith('/photo-')) throw new Error('Paste an images.unsplash.com photo URL, or download a photo and choose its file.');
        address.searchParams.set('w', '3840'); address.searchParams.set('q', '85'); address.searchParams.set('fm', 'jpg');
        const response = await fetch(address, { signal: AbortSignal.timeout(30000), credentials: 'omit' }); if (!response.ok) throw new Error('The photo could not be downloaded.');
        if (Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw new Error('Image exceeds 20 MB.');
        await choose(await response.blob());
      } catch (error) { setMessage(String(error)); } finally { setBusy(false); } }}>{busy ? 'Loading…' : 'Use Unsplash image'}</button><p className="ap-note">Open a photo on Unsplash, copy its image address, or download it and choose the file. Images remain available offline after selection.</p></>}
    {message && <p className="ap-note selectable" role="status">{message}</p>}
  </div>;
}
