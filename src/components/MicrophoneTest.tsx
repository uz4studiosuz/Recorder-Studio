import { useEffect, useRef, useState } from 'react';
export function MicrophoneTest({ stream, busy = false }: { stream: MediaStream | null; busy?: boolean }) {
  const [recording, setRecording] = useState(false), [url, setUrl] = useState(''), [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const recorder = useRef<MediaRecorder | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setRecording(false); setUrl(''); audio.current?.pause(); return () => { clearTimeout(timer.current); const encoder = recorder.current; if (encoder) { encoder.onstop = null; encoder.ondataavailable = null; if (encoder.state === 'recording') encoder.stop(); } }; }, [stream, busy]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return <div className="microphone-test"><button className="button subtle" disabled={!stream || busy} onClick={() => {
    if (recording) { recorder.current?.stop(); return; }
    try {
      setError(''); const chunks: Blob[] = []; const encoder = new MediaRecorder(stream!); recorder.current = encoder;
      encoder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      encoder.onstop = () => { clearTimeout(timer.current); setRecording(false); if (chunks.length) setUrl(URL.createObjectURL(new Blob(chunks, { type: encoder.mimeType }))); };
      encoder.onerror = () => { setError('Microphone test could not record.'); setRecording(false); };
      encoder.start(); setRecording(true); timer.current = setTimeout(() => { if (encoder.state === 'recording') encoder.stop(); }, 5000);
    } catch (error) { setError(String(error)); }
  }}>{recording ? 'Stop microphone test' : 'Record 5-second mic test'}</button>{url && <audio ref={audio} controls src={url} aria-label="Microphone test playback" />}{error && <p className="inline-error">{error}</p>}</div>;
}
