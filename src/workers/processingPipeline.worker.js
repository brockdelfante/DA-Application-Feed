/**
 * Processing Pipeline Web Worker — self-contained, no inter-worker messaging.
 *
 * Steps:
 * 1. Detect word boundaries from energy/silence analysis
 * 2. Snap each word to nearest 1/16th note (shift, no stretch)
 * 3. Detect + label sections by energy
 * 4. Reorder sections to match target genre template
 * 5. Render output audio + individual stems
 */

import { processVocals } from '../utils/vocalProcessor.js';
import { encodeWAV } from '../utils/exportUtils.js';
import { pitchShift } from '../utils/audioEffects.js';
import { semitoneDistance, parseKeyLabel } from '../utils/keyDetection.js';

self.onmessage = async (event) => {
  if (event.data?.type === 'RUN_PIPELINE') {
    await runPipeline(event.data);
  }
};

async function runPipeline({ audioData, sampleRate, genre, targetBPM, targetKey, transcriptionResult }) {
  try {
    // ── Pitch shift to target key ───────────────────────────────────────────
    postProgress('EFFECTS', 5, 'Applying pitch correction…');
    let workingAudio = audioData;

    if (targetKey) {
      try {
        const { note: targetNote } = parseKeyLabel(targetKey);
        const semitones = semitoneDistance('C', targetNote);
        if (semitones !== 0) {
          workingAudio = pitchShift(audioData, semitones);
        }
      } catch {
        // key shift optional — continue without it
      }
    }

    // ── Core processing ─────────────────────────────────────────────────────
    // If we have Whisper word timestamps, use them to override word detection
    const whisperChunks = extractWhisperChunks(transcriptionResult);

    const { fullMix, stems, sectionPlan } = processVocals(
      workingAudio,
      sampleRate,
      {
        genre,
        targetBPM,
        whisperChunks,
        onProgress: ({ stage, pct, message }) => {
          postProgress(stage, pct, message);
        }
      }
    );

    // ── Encode stems ────────────────────────────────────────────────────────
    postProgress('ENCODE', 90, 'Encoding stems…');
    const encodedStems = stems.map(s => ({
      section: s.section,
      wavData: encodeWAV(s.audio, sampleRate),
      duration: s.duration
    }));

    self.postMessage({
      type: 'PIPELINE_COMPLETE',
      fullMixData: fullMix,
      wavBuffer: encodeWAV(fullMix, sampleRate),
      stems: encodedStems,
      sectionPlan,
      duration: fullMix.length / sampleRate
    });

  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err.message ?? String(err), stage: 'pipeline' });
  }
}

function postProgress(stage, pct, message) {
  const stageOrder = ['EFFECTS', 'WORDS', 'SNAP', 'BEAT_AUDIO', 'SECTIONS', 'RESTRUCTURE', 'RENDER', 'ENCODE', 'DONE'];
  const idx = stageOrder.indexOf(stage);
  const overall = idx >= 0 ? Math.round((idx / stageOrder.length) * 100) : pct;

  const stageLabels = {
    EFFECTS: 'Applying Effects',
    WORDS: 'Detecting Words',
    SNAP: 'Beat Snapping',
    BEAT_AUDIO: 'Rendering Beat Audio',
    SECTIONS: 'Detecting Sections',
    RESTRUCTURE: 'Restructuring',
    RENDER: 'Rendering Mix',
    ENCODE: 'Encoding',
    DONE: 'Complete'
  };

  self.postMessage({
    type: 'PIPELINE_PROGRESS',
    stage,
    stageLabel: stageLabels[stage] ?? stage,
    stagePct: pct,
    overallProgress: overall,
    message
  });
}

/**
 * Extract word chunks from Whisper transcription result if available.
 * Returns array of { start, end } or null if unavailable.
 */
function extractWhisperChunks(transcriptionResult) {
  if (!transcriptionResult?.chunks?.length) return null;
  return transcriptionResult.chunks
    .filter(c => c.timestamp?.[0] != null && c.timestamp?.[1] != null)
    .map(c => ({ start: c.timestamp[0], end: c.timestamp[1] }));
}
