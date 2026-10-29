import { useEffect, useState } from 'react';
import { deviceError } from '../engine/capture';
import { withTimeout } from '../../shared/async';
export function useLiveInput(kind: 'video' | 'audio', enabled: boolean, deviceId: string, retry: number) {
  const [stream, setStream] = useState<MediaStream | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false, expired = false, owned: MediaStream | undefined;
    setStream(null); setError(''); setLoading(enabled);
    if (enabled) void (async () => {
      try {
        await window.recorder?.armLoopback();
        const constraints = { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), ...(kind === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : { echoCancellation: true }) };
        const request = navigator.mediaDevices.getUserMedia({ video: kind === 'video' ? constraints : false, audio: kind === 'audio' ? constraints : false });
        void request.then(stream => { if (cancelled || expired) stream.getTracks().forEach(track => track.stop()); }, () => {});
        owned = await withTimeout(request, 30000, 'Device preview timed out. Check permission or turn this input off to continue.');
        if (cancelled) owned.getTracks().forEach(track => track.stop());
        else { setStream(owned); setLoading(false); for (const track of owned.getTracks()) track.addEventListener('ended', () => { if (!cancelled) { setStream(null); setError('Preview device disconnected. Reconnect it, then use Refresh.'); } }, { once: true }); }
      } catch (error) { expired = true; if (!cancelled) { setLoading(false); setError(deviceError(kind === 'video' ? 'Webcam preview' : 'Microphone preview', error)); } }
    })();
    return () => { cancelled = true; owned?.getTracks().forEach(track => track.stop()); };
  }, [kind, enabled, deviceId, retry]);
  return { stream, error, loading };
}
export function useAudioMeter(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    setLevel(0); if (!stream) return;
    const context = new AudioContext(), analyser = context.createAnalyser(); analyser.fftSize = 256;
    const source = context.createMediaStreamSource(stream); source.connect(analyser);
    void context.resume().catch(() => {}); const data = new Float32Array(analyser.fftSize);
    const timer = setInterval(() => { analyser.getFloatTimeDomainData(data); const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length); setLevel(Math.min(1, rms * 4)); }, 100);
    return () => { clearInterval(timer); source.disconnect(); void context.close().catch(() => {}); };
  }, [stream]);
  return level;
}
