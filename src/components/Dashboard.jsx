import { useState, useRef, useCallback, useEffect } from 'react';
import UploadArea from './UploadArea.jsx';
import GenreSelector from './GenreSelector.jsx';
import BPMSlider from './BPMSlider.jsx';
import KeySelector from './KeySelector.jsx';
import ProcessingProgress from './ProcessingProgress.jsx';
import WaveformVisualizer from './WaveformVisualizer.jsx';
import AudioPlayer from './AudioPlayer.jsx';
import ExportButton from './ExportButton.jsx';
import { decodeAudioFile } from '../utils/exportUtils.js';
import { GENRE_TEMPLATES } from '../utils/genreTemplates.js';

export default function Dashboard({ modelReady, fallbackMode, onTranscribe, modelWorkerRef }) {
  // ─── State ───────────────────────────────────────────────────────────────
  const [audioFile, setAudioFile] = useState(null);
  const [audioData, setAudioData] = useState(null);
  const [sampleRate, setSampleRate] = useState(44100);
  const [originalFileData, setOriginalFileData] = useState(null);

  // Analysis results
  const [detectedBPM, setDetectedBPM] = useState(null);
  const [detectedKey, setDetectedKey] = useState(null);
  const [beatGrid, setBeatGrid] = useState(null);
  const [silenceRegions, setSilenceRegions] = useState(null);
  const [analysisReady, setAnalysisReady] = useState(false);

  // User selections
  const [genre, setGenre] = useState('');
  const [targetBPM, setTargetBPM] = useState(120);
  const [targetKey, setTargetKey] = useState('');

  // Processing
  const [processing, setProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingLabel, setProcessingLabel] = useState('');

  // Output
  const [fullMixData, setFullMixData] = useState(null);
  const [stems, setStems] = useState(null);
  const [sectionPlan, setSectionPlan] = useState(null);
  const [outputDuration, setOutputDuration] = useState(0);
  const [transcriptionResult, setTranscriptionResult] = useState(null);

  const analysisWorkerRef = useRef(null);
  const pipelineWorkerRef = useRef(null);

  // ─── Analysis Worker ─────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/audioAnalysis.worker.js', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (e) => {
      const { type } = e.data;
      if (type === 'ANALYSIS_COMPLETE') {
        const { bpm, key, beatGrid, silenceRegions } = e.data;
        setDetectedBPM(bpm);
        setDetectedKey(key);
        setBeatGrid(beatGrid);
        setSilenceRegions(silenceRegions);
        setTargetBPM(bpm);
        setTargetKey(key.label);
        setAnalysisReady(true);
      }
    };
    analysisWorkerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // ─── Pipeline Worker ──────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/processingPipeline.worker.js', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (e) => {
      const { type } = e.data;

      if (type === 'PIPELINE_PROGRESS') {
        setProcessingStage(e.data.stage);
        setProcessingProgress(e.data.overallProgress);
        setProcessingMessage(e.data.message);
        setProcessingLabel(e.data.stageLabel);
      } else if (type === 'REQUEST_STRUCTURE') {
        // Relay to model worker
        if (modelWorkerRef?.current) {
          const { genre: g, bpm } = e.data;
          const origHandler = modelWorkerRef.current.onmessage;
          modelWorkerRef.current.onmessage = (evt) => {
            if (evt.data.type === 'STRUCTURE_COMPLETE') {
              worker.postMessage({ type: 'STRUCTURE_RESULT', sectionMap: evt.data.sectionMap });
              modelWorkerRef.current.onmessage = origHandler;
            }
          };
          modelWorkerRef.current.postMessage({ type: 'ANALYSE_STRUCTURE', transcript: g, genre: g, bpm });
        }
      } else if (type === 'PIPELINE_COMPLETE') {
        const { fullMixData, stems, sectionPlan, duration } = e.data;
        setFullMixData(fullMixData);
        setStems(stems);
        setSectionPlan(sectionPlan);
        setOutputDuration(duration);
        setProcessing(false);
        setProcessingProgress(100);
        setProcessingMessage('Done!');
      } else if (type === 'ERROR') {
        console.error('Pipeline error:', e.data.message);
        setProcessing(false);
        setProcessingMessage(`Error: ${e.data.message}`);
      }
    };
    pipelineWorkerRef.current = worker;
    return () => worker.terminate();
  }, [modelWorkerRef]);

  // ─── File Upload ──────────────────────────────────────────────────────────
  const handleFileSelected = useCallback(async (file) => {
    setAudioFile(file);
    setFullMixData(null);
    setStems(null);
    setSectionPlan(null);
    setAnalysisReady(false);
    setDetectedBPM(null);
    setDetectedKey(null);

    // Store raw file bytes for export
    const arrayBuf = await file.arrayBuffer();
    setOriginalFileData(new Uint8Array(arrayBuf));

    // Decode audio
    try {
      const { audioData: data, sampleRate: sr } = await decodeAudioFile(file);
      setAudioData(data);
      setSampleRate(sr);

      // Start analysis
      analysisWorkerRef.current?.postMessage({
        type: 'ANALYSE_AUDIO',
        audioData: data,
        sampleRate: sr
      });

      // Start transcription if models ready
      if (modelReady) {
        onTranscribe(data, sr, (result) => setTranscriptionResult(result));
      }
    } catch (err) {
      console.error('Decode error:', err);
      alert(`Could not decode audio: ${err.message}`);
    }
  }, [modelReady, onTranscribe]);

  // Also start transcription when models become ready after upload
  useEffect(() => {
    if (modelReady && audioData && !transcriptionResult) {
      onTranscribe(audioData, sampleRate, (result) => setTranscriptionResult(result));
    }
  }, [modelReady, audioData, sampleRate, transcriptionResult, onTranscribe]);

  // ─── Process ──────────────────────────────────────────────────────────────
  const canProcess = modelReady && analysisReady && genre && targetKey && !processing;

  const handleProcess = useCallback(() => {
    if (!canProcess || !audioData) return;
    setProcessing(true);
    setProcessingProgress(0);
    setProcessingStage('TRANSCRIBE');
    setFullMixData(null);
    setStems(null);
    setSectionPlan(null);

    pipelineWorkerRef.current?.postMessage({
      type: 'RUN_PIPELINE',
      audioData,
      sampleRate,
      genre,
      targetBPM,
      targetKey,
      beatGrid,
      silenceRegions,
      transcriptionResult
    });
  }, [canProcess, audioData, sampleRate, genre, targetBPM, targetKey, beatGrid, silenceRegions, transcriptionResult]);

  // Auto-set BPM when genre changes
  const handleGenreChange = (g) => {
    setGenre(g);
    if (g && GENRE_TEMPLATES[g] && !detectedBPM) {
      setTargetBPM(GENRE_TEMPLATES[g].defaultBPM);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <header className="text-center space-y-2">
        <h1 className="text-4xl font-black gradient-text">Vocal Restructurer</h1>
        <p className="text-white/40 text-sm">
          AI-powered vocal rearrangement — any genre, any key, any BPM
        </p>
      </header>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left column */}
        <div className="space-y-5">
          {/* Upload */}
          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
              1. Upload Vocals
            </h2>
            <UploadArea onFileSelected={handleFileSelected} />
          </div>

          {/* Analysis results */}
          {(detectedBPM || detectedKey) && (
            <div className="card flex gap-4">
              {detectedBPM && (
                <div className="flex-1 text-center">
                  <p className="text-xs text-white/40">Detected BPM</p>
                  <p className="text-2xl font-black text-accent-cyan">{detectedBPM}</p>
                </div>
              )}
              {detectedKey && (
                <div className="flex-1 text-center">
                  <p className="text-xs text-white/40">Detected Key</p>
                  <p className="text-lg font-bold text-accent-purple">{detectedKey.label}</p>
                  <p className="text-xs text-white/30">{Math.round(detectedKey.confidence * 100)}% confidence</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <div className="card space-y-5">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
              2. Configure Target
            </h2>
            <GenreSelector value={genre} onChange={handleGenreChange} disabled={processing} />
            <BPMSlider
              value={targetBPM}
              onChange={setTargetBPM}
              detectedBPM={detectedBPM}
              disabled={processing}
            />
            <KeySelector
              value={targetKey}
              onChange={setTargetKey}
              detectedKey={detectedKey}
              disabled={processing}
            />
          </div>

          {/* Process button */}
          <button
            type="button"
            className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2"
            onClick={handleProcess}
            disabled={!canProcess}
            aria-label="Process vocals"
          >
            {processing ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <span>🚀</span>
                {canProcess
                  ? (fallbackMode ? 'Process Vocals (Fallback Mode)' : 'Process Vocals')
                  : !audioFile ? 'Upload audio first'
                  : !genre ? 'Select a genre'
                  : !targetKey ? 'Select a key'
                  : !modelReady ? 'Loading models…'
                  : !analysisReady ? 'Analysing audio…'
                  : 'Process Vocals'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Waveform */}
      <WaveformVisualizer
        audioData={fullMixData ?? audioData}
        sampleRate={sampleRate}
        sectionPlan={sectionPlan}
        duration={outputDuration || (audioData ? audioData.length / sampleRate : 0)}
      />

      {/* Processing progress */}
      {processing && (
        <ProcessingProgress
          stage={processingStage}
          overallProgress={processingProgress}
          message={processingMessage}
          stageLabel={processingLabel}
        />
      )}

      {/* Output area */}
      {fullMixData && (
        <div className="space-y-5">
          <AudioPlayer
            audioData={fullMixData}
            sampleRate={sampleRate}
            label="Processed Mix Preview"
          />
          <div className="card">
            <ExportButton
              fullMixData={fullMixData}
              stems={stems}
              originalFileData={originalFileData}
              sampleRate={sampleRate}
              genre={genre}
              bpm={targetBPM}
              key={targetKey}
            />
          </div>
        </div>
      )}
    </div>
  );
}
