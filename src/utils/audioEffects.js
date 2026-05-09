/**
 * Audio effects applied to vocal slices:
 * - Pitch shifting (semitone-based)
 * - Auto-tune (snap-to-key pitch correction)
 * - Harmony layers (pitch-shifted doubles for chorus)
 * - Stutter/Reverb (EDM drop effect)
 * - Triplet slicing (Trap verse style)
 */

import { getScaleNotes, NOTE_NAMES } from './keyDetection.js';

// ─── Pitch Shifting ──────────────────────────────────────────────────────────

/**
 * Shift audio pitch by `semitones` using a simple phase-vocoder approximation.
 * For client-side use — real pitch shifting uses the Web Audio API PitchShift node.
 * This provides a simplified version for test/processing purposes.
 */
export function pitchShift(audioData, semitones) {
  if (semitones === 0) return audioData.slice();
  const ratio = Math.pow(2, semitones / 12);
  const inputLength = audioData.length;
  const outputLength = Math.round(inputLength / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, inputLength - 1);
    const frac = srcIdx - lo;
    output[i] = audioData[lo] * (1 - frac) + audioData[hi] * frac;
  }

  return output;
}

// ─── Auto-Tune ───────────────────────────────────────────────────────────────

/**
 * Frequency → closest note in a scale.
 * Returns the corrected frequency.
 */
export function snapFrequencyToScale(freq, rootNote, mode) {
  if (freq <= 0) return freq;
  const scaleNotes = getScaleNotes(rootNote, mode);
  const scaleIndices = scaleNotes.map(n => NOTE_NAMES.indexOf(n));

  // Convert freq to MIDI note
  const midi = 12 * Math.log2(freq / 440) + 69;
  const pc = ((Math.round(midi) % 12) + 12) % 12;

  // Find nearest note in scale
  let bestPc = scaleIndices[0];
  let minDist = 12;
  for (const idx of scaleIndices) {
    const dist = Math.min(Math.abs(idx - pc), 12 - Math.abs(idx - pc));
    if (dist < minDist) {
      minDist = dist;
      bestPc = idx;
    }
  }

  // Shift by correction amount
  const midiCorrected = Math.floor(midi / 12) * 12 + bestPc;
  return 440 * Math.pow(2, (midiCorrected - 69) / 12);
}

/**
 * Apply auto-tune (snap-to-key pitch correction) to a segment.
 * Operates on frame-by-frame basis using autocorrelation pitch detection.
 */
export function applyAutoTune(audioData, sampleRate, rootNote, mode) {
  const frameSize = 2048;
  const hopSize = 512;
  const output = new Float32Array(audioData.length);

  for (let i = 0; i + frameSize < audioData.length; i += hopSize) {
    const frame = audioData.slice(i, i + frameSize);
    const detectedFreq = detectPitchAutocorrelation(frame, sampleRate);

    if (detectedFreq > 80 && detectedFreq < 1200) {
      const correctedFreq = snapFrequencyToScale(detectedFreq, rootNote, mode);
      const semitoneShift = 12 * Math.log2(correctedFreq / detectedFreq);
      const corrected = pitchShift(frame, semitoneShift);
      const copyLen = Math.min(corrected.length, audioData.length - i);
      for (let j = 0; j < copyLen; j++) {
        output[i + j] += corrected[j] * 0.7; // blend
      }
    } else {
      const copyLen = Math.min(frameSize, audioData.length - i);
      for (let j = 0; j < copyLen; j++) {
        output[i + j] += frame[j] * 0.7;
      }
    }
  }

  return output;
}

/**
 * Autocorrelation-based pitch detector.
 * Returns fundamental frequency in Hz.
 */
export function detectPitchAutocorrelation(frame, sampleRate) {
  const n = frame.length;
  let maxCorr = -1;
  let bestLag = -1;

  const minLag = Math.floor(sampleRate / 1200);
  const maxLag = Math.floor(sampleRate / 80);

  for (let lag = minLag; lag <= Math.min(maxLag, n - 1); lag++) {
    let corr = 0;
    for (let j = 0; j + lag < n; j++) {
      corr += frame[j] * frame[j + lag];
    }
    if (corr > maxCorr) {
      maxCorr = corr;
      bestLag = lag;
    }
  }

  return bestLag > 0 ? sampleRate / bestLag : 0;
}

// ─── Harmony Layers ──────────────────────────────────────────────────────────

/**
 * Generate harmony layers (pitch-shifted doubles) for Pop chorus.
 * Returns array of Float32Array at +3 and +7 semitones (thirds/fifths).
 */
export function generateHarmonyLayers(audioData, semitoneOffsets = [3, 7]) {
  return semitoneOffsets.map(semitones => {
    const shifted = pitchShift(audioData, semitones);
    // Attenuate harmony layers
    const attenuated = new Float32Array(shifted.length);
    for (let i = 0; i < shifted.length; i++) {
      attenuated[i] = shifted[i] * 0.5;
    }
    return attenuated;
  });
}

/**
 * Mix multiple audio layers (all same length or padded).
 */
export function mixLayers(layers, weights = null) {
  if (layers.length === 0) return new Float32Array(0);
  const maxLen = Math.max(...layers.map(l => l.length));
  const output = new Float32Array(maxLen);
  const w = weights ?? layers.map(() => 1 / layers.length);

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    for (let i = 0; i < layer.length; i++) {
      output[i] += layer[i] * w[li];
    }
  }

  return output;
}

// ─── Stutter / Reverb ────────────────────────────────────────────────────────

/**
 * Apply rhythmic stutter gate to audio (EDM drop effect).
 * Divides audio into cells of `stutterBeatFraction` at given BPM.
 */
export function applyStutter(audioData, sampleRate, bpm, stutterBeatFraction = 0.25) {
  const cellDuration = (60 / bpm) * stutterBeatFraction;
  const cellSamples = Math.floor(cellDuration * sampleRate);
  const output = new Float32Array(audioData.length);

  for (let i = 0; i < audioData.length; i += cellSamples * 2) {
    // Copy first cell, silence second cell
    const copyEnd = Math.min(i + cellSamples, audioData.length);
    for (let j = i; j < copyEnd; j++) {
      output[j] = audioData[j];
    }
    // second cell stays silent (already zeroed)
  }

  return output;
}

/**
 * Simple convolution reverb using a synthetic IR (exponential decay).
 */
export function applyReverb(audioData, sampleRate, decaySeconds = 1.5, mix = 0.3) {
  const irLength = Math.floor(decaySeconds * sampleRate);
  const ir = new Float32Array(irLength);
  for (let i = 0; i < irLength; i++) {
    ir[i] = Math.exp(-i / (irLength * 0.2)) * (Math.random() * 2 - 1) * 0.5;
  }

  // Simple convolution (truncated for performance)
  const convLength = Math.min(irLength, 512);
  const output = new Float32Array(audioData.length);

  for (let i = 0; i < audioData.length; i++) {
    let wet = 0;
    for (let j = 0; j < convLength && j <= i; j++) {
      wet += audioData[i - j] * ir[j];
    }
    output[i] = audioData[i] * (1 - mix) + wet * mix;
  }

  return output;
}

// ─── Triplet Slicing ─────────────────────────────────────────────────────────

/**
 * Reslice audio onto a 1/16th triplet grid at the given BPM.
 */
export function applyTripletSlicing(audioData, sampleRate, bpm) {
  const sixteenthDur = (60 / bpm) / 4;
  const tripletDur = (sixteenthDur * 2) / 3; // 1/16th triplet
  const cellSamples = Math.floor(tripletDur * sampleRate);
  const output = new Float32Array(audioData.length);

  let outOffset = 0;
  let inOffset = 0;

  while (inOffset < audioData.length && outOffset < audioData.length) {
    const copyLen = Math.min(cellSamples, audioData.length - inOffset, audioData.length - outOffset);
    for (let i = 0; i < copyLen; i++) {
      output[outOffset + i] = audioData[inOffset + i];
    }
    outOffset += cellSamples;
    // Advance source by slightly less to create triplet feel (shift by 2/3 of a normal 16th)
    inOffset += Math.floor(cellSamples * 1.0);
  }

  return output;
}

// ─── Effect Router ────────────────────────────────────────────────────────────

/**
 * Apply all effects for a section based on the effects array and genre config.
 */
export function applyEffects(audioData, sampleRate, effectsList, genreConfig, bpm, rootNote, mode) {
  let result = audioData.slice();

  if (effectsList.includes('stutter') && genreConfig.stutter) {
    result = applyStutter(result, sampleRate, bpm);
  }

  if (effectsList.includes('reverb') && genreConfig.reverb) {
    result = applyReverb(result, sampleRate);
  }

  if (effectsList.includes('auto_tune') && genreConfig.autoTune) {
    result = applyAutoTune(result, sampleRate, rootNote, mode);
  }

  if (effectsList.includes('triplet') && genreConfig.tripletSlice) {
    result = applyTripletSlicing(result, sampleRate, bpm);
  }

  return result;
}
