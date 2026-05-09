/**
 * Audio Analysis Web Worker
 * Runs Meyda-based BPM + key detection on uploaded audio.
 * Runs concurrently with model loading — no UI freeze.
 */

import { detectBPM, computeBeatGrid } from '../utils/bpmDetection.js';
import { detectKey, computeChroma } from '../utils/keyDetection.js';
import { findSilenceRegions } from '../utils/smartSlicer.js';

self.onmessage = async (event) => {
  const { type } = event.data;

  if (type === 'ANALYSE_AUDIO') {
    const { audioData, sampleRate } = event.data;
    await analyseAudio(audioData, sampleRate);
  }
};

async function analyseAudio(audioData, sampleRate) {
  try {
    self.postMessage({ type: 'ANALYSIS_PROGRESS', progress: 0, message: 'Starting audio analysis…' });

    // BPM Detection
    self.postMessage({ type: 'ANALYSIS_PROGRESS', progress: 20, message: 'Detecting BPM…' });
    const bpm = detectBPM(audioData, sampleRate);

    // Beat Grid
    self.postMessage({ type: 'ANALYSIS_PROGRESS', progress: 40, message: 'Computing beat grid…' });
    const duration = audioData.length / sampleRate;
    const beatGrid = computeBeatGrid(bpm, duration);

    // Key Detection
    self.postMessage({ type: 'ANALYSIS_PROGRESS', progress: 60, message: 'Detecting key…' });
    const keyResult = detectKey(audioData, sampleRate);

    // Silence regions for smart slicing
    self.postMessage({ type: 'ANALYSIS_PROGRESS', progress: 80, message: 'Mapping silence regions…' });
    const silenceRegions = findSilenceRegions(audioData, sampleRate);

    // Chroma for visualisation
    const chroma = computeChroma(audioData.slice(0, 4096), sampleRate);

    self.postMessage({ type: 'ANALYSIS_PROGRESS', progress: 100, message: 'Analysis complete.' });
    self.postMessage({
      type: 'ANALYSIS_COMPLETE',
      bpm,
      key: keyResult,
      beatGrid,
      silenceRegions,
      chroma,
      duration
    });

  } catch (err) {
    self.postMessage({ type: 'ERROR', message: `Audio analysis failed: ${err.message}`, stage: 'analysis' });
  }
}
