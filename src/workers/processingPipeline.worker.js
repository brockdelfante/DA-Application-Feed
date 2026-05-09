/**
 * Processing Pipeline Web Worker
 * Orchestrates: Transcribe → Analyse Structure → Restructure → Apply Effects
 * Communicates progress back to main thread at each stage.
 */

import { buildSectionPlan, GENRE_TEMPLATES } from '../utils/genreTemplates.js';
import { buildCutPoints, sliceAudio } from '../utils/smartSlicer.js';
import { applyEffects, generateHarmonyLayers, mixLayers, pitchShift } from '../utils/audioEffects.js';
import { semitoneDistance, parseKeyLabel } from '../utils/keyDetection.js';
import { findBestArrangement } from '../utils/coherenceChecker.js';
import { encodeWAV } from '../utils/exportUtils.js';

const STAGES = {
  TRANSCRIBE: { label: 'Transcribing vocals', weight: 0.25 },
  ANALYSE: { label: 'Analysing structure', weight: 0.20 },
  RESTRUCTURE: { label: 'Restructuring sections', weight: 0.20 },
  EFFECTS: { label: 'Applying effects', weight: 0.25 },
  EXPORT: { label: 'Preparing export', weight: 0.10 }
};

self.onmessage = async (event) => {
  const { type } = event.data;

  if (type === 'RUN_PIPELINE') {
    const { audioData, sampleRate, genre, targetBPM, targetKey,
            beatGrid, silenceRegions, transcriptionResult } = event.data;
    await runPipeline({ audioData, sampleRate, genre, targetBPM, targetKey,
                        beatGrid, silenceRegions, transcriptionResult });
  }
};

async function runPipeline({ audioData, sampleRate, genre, targetBPM, targetKey,
                              beatGrid, silenceRegions, transcriptionResult }) {
  try {
    // ─── Stage 1: Parse transcription ───────────────────────────────────────
    progress('TRANSCRIBE', 0, 'Processing transcript…');

    const words = parseWordTimestamps(transcriptionResult);
    const fullTranscript = formatTranscriptWithTimestamps(words);
    progress('TRANSCRIBE', 100, 'Transcript ready.');

    // ─── Stage 2: Structural analysis ───────────────────────────────────────
    progress('ANALYSE', 0, 'Analysing song structure…');

    // Request structure analysis from model loader worker (main thread mediates)
    const sectionMap = await requestStructureAnalysis(fullTranscript, genre, targetBPM);
    progress('ANALYSE', 100, 'Structure analysed.');

    // ─── Stage 3: Build section plan + smart slicing ────────────────────────
    progress('RESTRUCTURE', 0, 'Planning sections…');
    const duration = audioData.length / sampleRate;
    let sectionPlan = buildSectionPlan(sectionMap, genre, targetBPM, duration);

    // Adjust cut points for word boundaries + silence + beat grid
    progress('RESTRUCTURE', 30, 'Finding best cut points…');
    sectionPlan = buildCutPoints(sectionPlan, words, silenceRegions, beatGrid, targetBPM);

    // Slice audio
    progress('RESTRUCTURE', 60, 'Slicing audio…');
    let slices = sliceAudio(audioData, sampleRate, sectionPlan);

    // Lyrical coherence check
    progress('RESTRUCTURE', 80, 'Checking lyrical coherence…');
    const transcriptSegments = slices.map(s => ({
      section: s.section,
      text: extractTextForTimeRange(words, s.sourceStart, s.sourceEnd),
      start: s.sourceStart,
      end: s.sourceEnd
    }));

    const { arrangement } = findBestArrangement(sectionPlan, transcriptSegments);
    if (arrangement !== sectionPlan) {
      slices = sliceAudio(audioData, sampleRate, arrangement);
    }
    progress('RESTRUCTURE', 100, 'Restructuring complete.');

    // ─── Stage 4: Apply effects ──────────────────────────────────────────────
    progress('EFFECTS', 0, 'Applying audio effects…');
    const template = GENRE_TEMPLATES[genre];
    const { note: targetNote, mode: targetMode } = parseKeyLabel(targetKey);

    // Detect source key from audio (approximation)
    const sourceKeyNote = 'C'; // Would be from analysis worker result
    const semitones = semitoneDistance(sourceKeyNote, targetNote);

    const processedSlices = [];
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      let audio = slice.audio;

      // Global pitch shift to target key
      if (semitones !== 0 && template.effects.pitchShift) {
        audio = pitchShift(audio, semitones);
      }

      // Section-specific effects
      audio = applyEffects(
        audio, sampleRate, slice.effects, template.effects,
        targetBPM, targetNote, targetMode
      );

      // Pop harmony layers for chorus
      if (slice.effects.includes('harmony') && template.effects.harmony) {
        const harmonies = generateHarmonyLayers(audio);
        audio = mixLayers([audio, ...harmonies], [0.6, 0.25, 0.15]);
      }

      processedSlices.push({ ...slice, audio });
      progress('EFFECTS', Math.round(((i + 1) / slices.length) * 100), `Processing ${slice.section}…`);
    }

    // ─── Stage 5: Assemble + encode export data ──────────────────────────────
    progress('EXPORT', 0, 'Assembling final mix…');
    const fullMixData = assembleMix(processedSlices);
    progress('EXPORT', 40, 'Encoding WAV…');
    const wavBuffer = encodeWAV(fullMixData, sampleRate);

    // Individual stems
    const stems = processedSlices.map(s => ({
      section: s.section,
      wavData: encodeWAV(s.audio, sampleRate),
      duration: s.duration
    }));

    progress('EXPORT', 100, 'Export ready.');

    self.postMessage({
      type: 'PIPELINE_COMPLETE',
      fullMixData,
      wavBuffer,
      stems,
      sectionPlan: arrangement,
      transcriptSegments,
      duration: fullMixData.length / sampleRate
    });

  } catch (err) {
    self.postMessage({ type: 'ERROR', message: `Pipeline failed: ${err.message}`, stage: 'pipeline' });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function progress(stage, pct, message) {
  const stageKeys = Object.keys(STAGES);
  const stageIdx = stageKeys.indexOf(stage);
  const stageWeights = Object.values(STAGES).map(s => s.weight);
  const beforeWeight = stageWeights.slice(0, stageIdx).reduce((a, b) => a + b, 0);
  const overallProgress = Math.round((beforeWeight + stageWeights[stageIdx] * pct / 100) * 100);

  self.postMessage({
    type: 'PIPELINE_PROGRESS',
    stage,
    stageLabel: STAGES[stage]?.label,
    stagePct: pct,
    overallProgress,
    message
  });
}

function parseWordTimestamps(transcriptionResult) {
  if (!transcriptionResult) return [];
  if (Array.isArray(transcriptionResult.chunks)) {
    return transcriptionResult.chunks.map(c => ({
      word: c.text,
      start: c.timestamp?.[0] ?? 0,
      end: c.timestamp?.[1] ?? 0
    }));
  }
  return [];
}

function formatTranscriptWithTimestamps(words) {
  return words
    .map(w => `[${w.start.toFixed(1)}s] ${w.word}`)
    .join(' ');
}

function extractTextForTimeRange(words, start, end) {
  return words
    .filter(w => w.start >= start - 0.1 && w.end <= end + 0.1)
    .map(w => w.word)
    .join(' ');
}

function assembleMix(processedSlices) {
  const totalLength = processedSlices.reduce((acc, s) => acc + s.audio.length, 0);
  const output = new Float32Array(totalLength);
  let offset = 0;
  for (const slice of processedSlices) {
    output.set(slice.audio, offset);
    offset += slice.audio.length;
  }
  return output;
}

// Structure analysis is requested via a SharedWorker message relay.
// This promise resolves when the main thread posts back the result.
let structureResolve = null;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'STRUCTURE_RESULT') {
    if (structureResolve) {
      structureResolve(event.data.sectionMap);
      structureResolve = null;
    }
  }
});

function requestStructureAnalysis(transcript, genre, bpm) {
  return new Promise((resolve) => {
    structureResolve = resolve;
    self.postMessage({ type: 'REQUEST_STRUCTURE', transcript, genre, bpm });

    // Timeout fallback after 30s
    setTimeout(() => {
      if (structureResolve) {
        structureResolve(buildFallbackMap(transcript, genre));
        structureResolve = null;
      }
    }, 30000);
  });
}

function buildFallbackMap(transcript, genre) {
  const duration = 120;
  const sections = {
    'EDM': ['intro', 'verse', 'chorus', 'drop', 'outro'],
    'Hip-Hop': ['intro', 'verse', 'chorus', 'verse', 'outro'],
    'Pop': ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'outro'],
    'Trap': ['intro', 'verse', 'chorus', 'drop', 'outro'],
    'House': ['intro', 'verse', 'chorus', 'breakdown', 'outro'],
    'Techno': ['intro', 'build', 'breakdown', 'outro']
  };
  const list = sections[genre] ?? sections['Pop'];
  const dur = duration / list.length;
  const map = {};
  list.forEach((name, i) => {
    map[`${Math.round(i * dur)}s-${Math.round((i + 1) * dur)}s`] = name;
  });
  return map;
}
