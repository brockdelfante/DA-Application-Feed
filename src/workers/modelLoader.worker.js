/**
 * Model Loader Web Worker
 * - Whisper-tiny via Transformers.js for in-browser transcription
 * - OpenRouter API for text-based structure analysis + coherence check
 * Reports progress back to the main thread.
 */

import { pipeline, env } from '@xenova/transformers';

// Point ONNX runtime WASM to the CDN so the paths work in any deployment
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.allowLocalModels = false;

let transcriber = null;
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

    // Check if OpenRouter is available (text tasks don't need local models)
    const hasApiKey = !!(self.__VITE_OPENROUTER_API_KEY__ || '');

    // Load Whisper-tiny for transcription
    self.postMessage({ type: 'PROGRESS', stage: 'whisper', progress: 5, message: 'Downloading Whisper-tiny (transcription)…' });
    transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny',
      {
        progress_callback: (progressEvent) => {
          if (progressEvent.status === 'downloading') {
            const pct = progressEvent.total > 0
              ? Math.round((progressEvent.loaded / progressEvent.total) * 90)
              : 0;
            self.postMessage({
              type: 'PROGRESS',
              stage: 'whisper',
              progress: 5 + pct,
              message: `Whisper-tiny: ${pct}%`
            });
          }
        }
      }
    );

    _isReady = true;
    self.postMessage({
      type: 'MODELS_READY',
      progress: 100,
      whisperReady: true,
      apiMode: hasApiKey
    });

  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      message: `Model loading failed: ${err.message}`,
      stage: 'models'
    });
  }
}

async function transcribeAudio(audioData, sampleRate) {
  if (!transcriber) {
    self.postMessage({ type: 'ERROR', message: 'Transcriber not loaded', stage: 'transcribe' });
    return;
  }

  try {
    self.postMessage({ type: 'PROGRESS', stage: 'transcribe', progress: 0, message: 'Transcribing…' });

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
  // Try OpenRouter first (much better quality)
  const apiKey = self.__VITE_OPENROUTER_API_KEY__;
  if (apiKey) {
    try {
      const sectionMap = await callOpenRouterStructure(transcript, genre, bpm, apiKey);
      self.postMessage({ type: 'STRUCTURE_COMPLETE', sectionMap, source: 'openrouter' });
      return;
    } catch (err) {
      // Fall through to heuristic
      console.warn('OpenRouter structure analysis failed, using fallback:', err.message);
    }
  }

  // Heuristic fallback
  const fallback = buildFallbackSectionMap(transcript, genre, bpm);
  self.postMessage({ type: 'STRUCTURE_COMPLETE', sectionMap: fallback, source: 'fallback' });
}

async function checkCoherence(reorderedTranscript, _genre) {
  try {
    const { checkLyricalCoherence } = await import('../utils/coherenceChecker.js');
    const result = checkLyricalCoherence(reorderedTranscript);
    self.postMessage({ type: 'COHERENCE_COMPLETE', result });
  } catch {
    self.postMessage({ type: 'COHERENCE_COMPLETE', result: { coherent: true, score: 0.5, issues: [] } });
  }
}

// ─── OpenRouter API call (runs inside worker — fetch is available) ─────────

async function callOpenRouterStructure(transcript, genre, bpm, apiKey) {
  const prompt = `You are a music producer analysing a vocal performance for ${genre} at ${bpm} BPM.

Given this transcript with word timestamps:
${transcript}

Identify the song sections (intro, verse, pre-chorus, chorus, bridge, outro, drop, breakdown).
Return ONLY a JSON object mapping time ranges to section names. Example:
{"0s-8s":"intro","8s-24s":"verse","24s-32s":"chorus"}

Rules:
- Cover the full duration with no gaps and no overlaps
- Use only: intro, verse, pre-chorus, chorus, bridge, outro, drop, breakdown
- Output valid JSON only — no explanation, no markdown`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://brockdelfante.github.io/Vocal-Aligner/',
      'X-Title': 'Vocal Restructurer'
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in OpenRouter response');

  const { parseSectionJSON } = await import('../utils/coherenceChecker.js');
  return parseSectionJSON(match[0]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function buildFallbackSectionMap(transcript, genre, _bpm) {
  const timeMatches = [...transcript.matchAll(/\[(\d+\.?\d*)s\]/g)];
  const lastTime = timeMatches.length > 0
    ? parseFloat(timeMatches[timeMatches.length - 1][1])
    : 120;

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
