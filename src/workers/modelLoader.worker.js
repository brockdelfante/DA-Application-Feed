/**
 * Model Loader Web Worker
 * Downloads and caches Whisper-tiny and SmolLM via Transformers.js.
 * Reports progress back to the main thread.
 */

import { pipeline, env } from '@xenova/transformers';

// Point ONNX runtime WASM to the CDN so the paths work in any deployment
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.allowLocalModels = false;

// Cache pipelines in worker scope
let transcriber = null;
let structureAnalyser = null;
// eslint-disable-next-line no-unused-vars
let _isReady = false;

self.onmessage = async (event) => {
  const { type } = event.data;

  if (type === 'LOAD_MODELS') {
    await loadModels();
  } else if (type === 'TRANSCRIBE') {
    const { audioData, sampleRate } = event.data;
    await transcribeAudio(audioData, sampleRate);
  } else if (type === 'ANALYSE_STRUCTURE') {
    const { transcript, genre, bpm } = event.data;
    await analyseStructure(transcript, genre, bpm);
  } else if (type === 'CHECK_COHERENCE') {
    const { reorderedTranscript, genre } = event.data;
    await checkCoherence(reorderedTranscript, genre);
  }
};

async function loadModels() {
  try {
    self.postMessage({ type: 'PROGRESS', stage: 'models', progress: 0, message: 'Starting model download…' });

    // Load Whisper-tiny for transcription
    self.postMessage({ type: 'PROGRESS', stage: 'whisper', progress: 5, message: 'Downloading Whisper-tiny…' });
    transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny',
      {
        progress_callback: (progressEvent) => {
          if (progressEvent.status === 'downloading') {
            const pct = progressEvent.total > 0
              ? Math.round((progressEvent.loaded / progressEvent.total) * 45)
              : 0;
            self.postMessage({ type: 'PROGRESS', stage: 'whisper', progress: 5 + pct, message: `Whisper-tiny: ${pct * 2}%` });
          }
        }
      }
    );

    self.postMessage({ type: 'PROGRESS', stage: 'whisper', progress: 50, message: 'Whisper-tiny ready.' });

    // Load SmolLM for structural analysis
    self.postMessage({ type: 'PROGRESS', stage: 'smollm', progress: 55, message: 'Downloading SmolLM…' });
    structureAnalyser = await pipeline(
      'text-generation',
      'Xenova/smollm-135m-instruct',
      {
        progress_callback: (progressEvent) => {
          if (progressEvent.status === 'downloading') {
            const pct = progressEvent.total > 0
              ? Math.round((progressEvent.loaded / progressEvent.total) * 40)
              : 0;
            self.postMessage({ type: 'PROGRESS', stage: 'smollm', progress: 55 + pct, message: `SmolLM: ${pct * 2}%` });
          }
        }
      }
    );

    self.postMessage({ type: 'PROGRESS', stage: 'smollm', progress: 95, message: 'SmolLM ready.' });
    _isReady = true;
    self.postMessage({ type: 'MODELS_READY', progress: 100 });

  } catch (err) {
    self.postMessage({ type: 'ERROR', message: `Model loading failed: ${err.message}`, stage: 'models' });
  }
}

async function transcribeAudio(audioData, sampleRate) {
  if (!transcriber) {
    self.postMessage({ type: 'ERROR', message: 'Transcriber not loaded', stage: 'transcribe' });
    return;
  }

  try {
    self.postMessage({ type: 'PROGRESS', stage: 'transcribe', progress: 0, message: 'Transcribing…' });

    // Whisper expects Float32 at 16kHz — resample if needed
    let input = audioData;
    if (sampleRate !== 16000) {
      input = resampleTo16kHz(audioData, sampleRate);
    }

    const result = await transcriber(input, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5
    });

    self.postMessage({ type: 'TRANSCRIPTION_COMPLETE', result });

  } catch (err) {
    self.postMessage({ type: 'ERROR', message: `Transcription failed: ${err.message}`, stage: 'transcribe' });
  }
}

async function analyseStructure(transcript, genre, bpm) {
  if (!structureAnalyser) {
    // Fallback: return a default section map based on transcript length
    const fallback = buildFallbackSectionMap(transcript, genre, bpm);
    self.postMessage({ type: 'STRUCTURE_COMPLETE', sectionMap: fallback });
    return;
  }

  try {
    const { buildStructurePrompt } = await import('../utils/coherenceChecker.js');
    const { parseSectionJSON } = await import('../utils/coherenceChecker.js');

    const prompt = buildStructurePrompt(transcript, genre, bpm);
    const output = await structureAnalyser(prompt, {
      max_new_tokens: 200,
      temperature: 0.1,
      do_sample: false
    });

    const generatedText = output[0]?.generated_text ?? '';
    // Extract JSON from the response
    const jsonMatch = generatedText.match(/\{[^{}]+\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');

    const sectionMap = parseSectionJSON(jsonMatch[0]);
    self.postMessage({ type: 'STRUCTURE_COMPLETE', sectionMap });

  } catch (err) {
    // Fallback to heuristic analysis
    const fallback = buildFallbackSectionMap(transcript, genre, bpm);
    self.postMessage({ type: 'STRUCTURE_COMPLETE', sectionMap: fallback, usedFallback: true });
  }
}

async function checkCoherence(reorderedTranscript, _genre) {
  try {
    const { checkLyricalCoherence } = await import('../utils/coherenceChecker.js');
    const result = checkLyricalCoherence(reorderedTranscript);
    self.postMessage({ type: 'COHERENCE_COMPLETE', result });
  } catch (err) {
    self.postMessage({ type: 'COHERENCE_COMPLETE', result: { coherent: true, score: 0.5, issues: [] } });
  }
}

/**
 * Resample Float32 audio from `sourceSampleRate` to 16000 Hz.
 */
function resampleTo16kHz(audioData, sourceSampleRate) {
  if (sourceSampleRate === 16000) return audioData;
  const ratio = sourceSampleRate / 16000;
  const outputLength = Math.round(audioData.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, audioData.length - 1);
    const frac = srcIdx - lo;
    output[i] = audioData[lo] * (1 - frac) + audioData[hi] * frac;
  }
  return output;
}

/**
 * Fallback heuristic: divide audio into sections based on duration and genre template.
 */
function buildFallbackSectionMap(transcript, genre, _bpm) {
  // Extract duration hint from transcript timestamps if available
  const timeMatches = [...transcript.matchAll(/\[(\d+\.?\d*)s\]/g)];
  const lastTime = timeMatches.length > 0
    ? parseFloat(timeMatches[timeMatches.length - 1][1])
    : 120; // default 2 min

  const sectionNames = {
    'EDM': ['intro', 'verse', 'pre-chorus', 'chorus', 'drop', 'bridge', 'outro'],
    'Hip-Hop': ['intro', 'verse', 'chorus', 'verse', 'bridge', 'outro'],
    'Pop': ['intro', 'verse', 'pre-chorus', 'chorus', 'verse', 'chorus', 'bridge', 'outro'],
    'Trap': ['intro', 'verse', 'pre-chorus', 'chorus', 'drop', 'bridge', 'outro'],
    'House': ['intro', 'verse', 'chorus', 'breakdown', 'chorus', 'outro'],
    'Techno': ['intro', 'build', 'breakdown', 'build', 'outro']
  };

  const sections = sectionNames[genre] ?? sectionNames['Pop'];
  const sectionDur = lastTime / sections.length;
  const map = {};

  for (let i = 0; i < sections.length; i++) {
    const start = Math.round(i * sectionDur);
    const end = Math.round((i + 1) * sectionDur);
    map[`${start}s-${end}s`] = sections[i];
  }

  return map;
}
