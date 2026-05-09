import { useEffect, useRef, useState } from 'react';

export default function AudioPlayer({ audioData, sampleRate, label = 'Preview' }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const startTimeRef = useRef(0);
  const pauseOffsetRef = useRef(0);

  useEffect(() => {
    if (!audioData) return;
    const dur = audioData.length / sampleRate;
    setDuration(dur);
    setCurrentTime(0);
    setIsPlaying(false);
    stopPlayback();
  }, [audioData, sampleRate]);

  useEffect(() => {
    let raf;
    const tick = () => {
      if (isPlaying && audioCtxRef.current) {
        const elapsed = audioCtxRef.current.currentTime - startTimeRef.current + pauseOffsetRef.current;
        const t = Math.min(elapsed, duration);
        setCurrentTime(t);
        if (t < duration) raf = requestAnimationFrame(tick);
        else setIsPlaying(false);
      }
    };
    if (isPlaying) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, duration]);

  function stopPlayback() {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current = null;
    }
  }

  function play() {
    if (!audioData) return;
    const AudioCtx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;

    const buffer = ctx.createBuffer(1, audioData.length, sampleRate);
    buffer.copyToChannel(audioData, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0, pauseOffsetRef.current);
    source.onended = () => setIsPlaying(false);

    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime;
    setIsPlaying(true);
  }

  function pause() {
    stopPlayback();
    pauseOffsetRef.current = currentTime;
    setIsPlaying(false);
  }

  function handleSeek(e) {
    const t = parseFloat(e.target.value);
    pauseOffsetRef.current = t;
    setCurrentTime(t);
    if (isPlaying) {
      stopPlayback();
      play();
    }
  }

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!audioData) return null;

  return (
    <div className="card space-y-3">
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">{label}</h3>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-secondary w-10 h-10 flex items-center justify-center rounded-full text-lg flex-shrink-0"
          onClick={isPlaying ? pause : play}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <div className="flex-1 space-y-1">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 accent-accent-purple cursor-pointer"
            aria-label="Playback position"
          />
          <div className="flex justify-between text-xs text-white/30">
            <span>{fmt(currentTime)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
