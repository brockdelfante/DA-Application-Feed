import { useState, useEffect, useRef, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';
import ModelDownloadProgress from './components/ModelDownloadProgress.jsx';

export default function App() {
  const [modelStatus, setModelStatus] = useState({
    loading: false,
    ready: false,
    progress: 0,
    message: 'Click to load AI models'
  });

  const modelWorkerRef = useRef(null);

  // Initialise model loader worker
  useEffect(() => {
    const worker = new Worker(
      new URL('./workers/modelLoader.worker.js', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event) => {
      const { type, progress, message } = event.data;
      if (type === 'PROGRESS') {
        setModelStatus(prev => ({ ...prev, loading: true, progress: progress ?? prev.progress, message: message ?? prev.message }));
      } else if (type === 'MODELS_READY') {
        setModelStatus({ loading: false, ready: true, progress: 100, message: 'AI models ready' });
      } else if (type === 'ERROR') {
        setModelStatus(prev => ({ ...prev, loading: false, message: `Error: ${event.data.message}` }));
      }
    };

    modelWorkerRef.current = worker;

    // Auto-start model download
    worker.postMessage({ type: 'LOAD_MODELS' });
    setModelStatus(prev => ({ ...prev, loading: true, progress: 0, message: 'Connecting to model hub…' }));

    return () => worker.terminate();
  }, []);

  const handleTranscribe = useCallback((audioData, sampleRate, onResult) => {
    if (!modelWorkerRef.current) return;
    modelWorkerRef.current.onmessage = (event) => {
      if (event.data.type === 'TRANSCRIPTION_COMPLETE') {
        onResult(event.data.result);
      }
    };
    modelWorkerRef.current.postMessage({ type: 'TRANSCRIBE', audioData, sampleRate });
  }, []);

  const handleAnalyseStructure = useCallback((transcript, genre, bpm, onResult) => {
    if (!modelWorkerRef.current) return;
    const origHandler = modelWorkerRef.current.onmessage;
    modelWorkerRef.current.onmessage = (event) => {
      if (event.data.type === 'STRUCTURE_COMPLETE') {
        modelWorkerRef.current.onmessage = origHandler;
        onResult(event.data.sectionMap);
      }
    };
    modelWorkerRef.current.postMessage({ type: 'ANALYSE_STRUCTURE', transcript, genre, bpm });
  }, []);

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      {/* Corner model download indicator */}
      <ModelDownloadProgress status={modelStatus} />

      <Dashboard
        modelReady={modelStatus.ready}
        onTranscribe={handleTranscribe}
        onAnalyseStructure={handleAnalyseStructure}
        modelWorkerRef={modelWorkerRef}
      />
    </div>
  );
}
