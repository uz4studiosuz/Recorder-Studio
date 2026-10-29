import { useEffect, useRef } from 'react';
export function useDialog(close: () => void, canClose: boolean) {
  const latest = useRef({ close, canClose }); latest.current = { close, canClose };
  useEffect(() => {
    const modal = document.querySelector<HTMLElement>('.modal');
    const previous = document.activeElement as HTMLElement | null;
    const background = document.querySelectorAll<HTMLElement>('.topbar, .workspace, .statusbar, .home-shell');
    background.forEach(element => { element.inert = true; });
    const focusable = () => [...modal?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([hidden]), select:not(:disabled), [tabindex="0"]') ?? []];
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && latest.current.canClose) { event.preventDefault(); latest.current.close(); }
      if (event.key === 'Tab') {
        const elements = focusable(); const index = elements.indexOf(document.activeElement as HTMLElement);
        if (!elements.length) return;
        if (event.shiftKey && index <= 0) { event.preventDefault(); elements.at(-1)?.focus(); }
        else if (!event.shiftKey && (index === elements.length - 1 || index < 0)) { event.preventDefault(); elements[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); background.forEach(element => { element.inert = false; }); previous?.focus(); };
  }, []);
}
