import { useRef } from 'react';
import { useEditor } from '../store/editor';

/** Drag handle that resizes the inspector (x) or the timeline (y). Double-click restores the default size. */
export function Splitter({ axis }: { axis: 'x' | 'y' }) {
  const start = useRef<{ pointer: number; size: number } | null>(null);
  const label = axis === 'x' ? 'Resize inspector' : 'Resize timeline';
  const size = () => axis === 'x' ? useEditor.getState().panels.inspector : useEditor.getState().panels.timeline;
  const apply = (value: number) => useEditor.getState().setPanels(axis === 'x' ? { inspector: value } : { timeline: value });
  return <div role="separator" aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} aria-label={label} title={`${label} · double-click to reset`} tabIndex={0} className={`splitter splitter-${axis}`}
    onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); start.current = { pointer: axis === 'x' ? event.clientX : event.clientY, size: size() }; document.body.classList.add(`resizing-${axis}`); }}
    onPointerMove={event => { const s = start.current; if (!s) return; apply(s.size - ((axis === 'x' ? event.clientX : event.clientY) - s.pointer)); }}
    onPointerUp={() => { start.current = null; document.body.classList.remove(`resizing-${axis}`); }}
    onPointerCancel={() => { start.current = null; document.body.classList.remove(`resizing-${axis}`); }}
    onDoubleClick={() => apply(axis === 'x' ? 320 : 255)}
    onKeyDown={event => { const step = event.shiftKey ? 40 : 10; const grow = axis === 'x' ? ['ArrowLeft'] : ['ArrowUp'], shrink = axis === 'x' ? ['ArrowRight'] : ['ArrowDown']; if (grow.includes(event.key)) { event.preventDefault(); apply(size() + step); } if (shrink.includes(event.key)) { event.preventDefault(); apply(size() - step); } }} />;
}
