import { useState, useEffect, useRef, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';
import ModelDownloadProgress from './components/ModelDownloadProgress.jsx';

export default function App() {
  const [modelStatus, setModelStatus] = useState({
    loading: false,
    ready: false,
    fallback: false,
    progress: 0,
    message: 'Connecting to model hub…'
  });

  const modelWorkerRef = useRef(null);

  useEffect(() => {
    let worker;
    try {
      worker = new Worker(
        new URL('./workers/modelLoader.worker.js', import.meta.url),
        { type: 'module' }
      );
    } catch (err) {
      // Worker failed to start — enable fallback mode immediately
      setModelStatus({ loading: false, ready: true, fallback: true, progress: 100, message: 'Running in fallback mode (no AI transcription)' });
      return;
    }

    worker.onmessage = (event) => {
      const { type, progress, message } = event.data;
      if (type === 'PROGRESS') {
        setModelStatus(prev => ({ ...prev, loading: true, progress: progress ?? prev.progress, message: message ?? prev.message }));
      } else if (type === 'MODELS_READY') {
        setModelStatus({ loading: false, ready: true, fallback: false, progress: 100, message: 'AI models ready' });
      } else if (type === 'ERROR') {
        // Model load failed — switch to fallback mode so the user can still process audio
        setModelStatus({ loading: false, ready: true, fallback: true, progress: 100, message: `Fallback mode — AI unavailable: ${event.data.message}` });
      }
    };

    worker.onerror = (err) => {
      setModelStatus({ loading: false, ready: true, fallback: true, progress: 100, message: `Fallback mode (worker error: ${err.message ?? 'unknown'})` });
    };

    modelWorkerRef.current = worker;

    worker.postMessage({ type: 'LOAD_MODELS' });
    setModelStatus(prev => ({ ...prev, loading: true, progress: 0, message: 'Connecting to model hub…' }));

    // Timeout: if models take longer than 3 min, switch to fallback
    const timeout = setTimeout(() => {
      setModelStatus(prev => {
        if (!prev.ready) {
          return { loading: false, ready: true, fallback: true, progress: 100, message: 'Fallback mode (model download timed out)' };
        }
        return prev;
      });
    }, 180000);

    return () => {
      clearTimeout(timeout);
      worker.terminate();
    };
  }, []);

  const handleTranscribe = useCallback((audioData, sampleRate, onResult) => {
    if (!modelWorkerRef.current || modelStatus.fallback) {
      // Fallback: return empty transcription result
      onResult({ chunks: [] });
      return;
    }
    modelWorkerRef.current.onmessage = (event) => {
      if (event.data.type === 'TRANSCRIPTION_COMPLETE') {
        onResult(event.data.result);
      } else if (event.data.type === 'ERROR') {
        onResult({ chunks: [] });
      }
    };
    modelWorkerRef.current.postMessage({ type: 'TRANSCRIBE', audioData, sampleRate });
  }, [modelStatus.fallback]);

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <ModelDownloadProgress status={modelStatus} />
      <Dashboard
        modelReady={modelStatus.ready}
        fallbackMode={modelStatus.fallback}
        onTranscribe={handleTranscribe}
        modelWorkerRef={modelWorkerRef}
      />
    </div>
  );
}
