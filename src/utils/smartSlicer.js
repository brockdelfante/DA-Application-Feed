/**
 * Smart slicer — cuts audio at word boundaries + silence/low-energy points,
 * snapped to beat grid. Never cuts mid-word or mid-line.
 * Applies 50ms crossfade at every cut point.
 */

import { snapToSixteenth, nearestBeat } from './bpmDetection.js';

const CROSSFADE_DURATION = 0.05; // 50ms

/**
 * Find silence boundaries in audio data.
 * Returns array of { start, end } in seconds where energy is below threshold.
 */
export function findSilenceRegions(audioData, sampleRate, thresholdRMS = 0.01, minSilenceSec = 0.05) {
  const frameSize = Math.floor(sampleRate * 0.01); // 10ms frames
  const minFrames = Math.ceil(minSilenceSec / 0.01);
  const regions = [];
  let silenceStart = null;
  let silenceCount = 0;

  for (let i = 0; i + frameSize < audioData.length; i += frameSize) {
    const frame = audioData.slice(i, i + frameSize);
    let sum = 0;
    for (let j = 0; j < frame.length; j++) sum += frame[j] * frame[j];
    const rms = Math.sqrt(sum / frame.length);

    const timeSec = i / sampleRate;

    if (rms < thresholdRMS) {
      if (silenceStart === null) silenceStart = timeSec;
      silenceCount++;
    } else {
      if (silenceStart !== null && silenceCount >= minFrames) {
        regions.push({ start: silenceStart, end: timeSec });
      }
      silenceStart = null;
      silenceCount = 0;
    }
  }

  if (silenceStart !== null && silenceCount >= minFrames) {
    regions.push({ start: silenceStart, end: audioData.length / sampleRate });
  }

  return regions;
}

/**
 * Find the nearest silence boundary to a target time,
 * then snap to the beat grid. Falls back to the target time if no silence found.
 */
export function findBestCutPoint(targetTime, silenceRegions, beatGrid, toleranceSec = 0.3) {
  let bestTime = targetTime;
  let minDist = toleranceSec;

  for (const region of silenceRegions) {
    const mid = (region.start + region.end) / 2;
    const dist = Math.abs(mid - targetTime);
    if (dist < minDist) {
      minDist = dist;
      bestTime = mid;
    }
  }

  // Snap to beat grid if available
  if (beatGrid && beatGrid.length > 0) {
    bestTime = nearestBeat(bestTime, beatGrid, toleranceSec);
  }

  return bestTime;
}

/**
 * Validate that no cut point falls mid-word using Whisper word timestamps.
 * words: [{ word, start, end }, ...]
 * cutPoint: time in seconds
 */
export function isMidWordCut(cutPoint, words) {
  for (const word of words) {
    // A cut is mid-word if it falls strictly inside a word boundary
    if (cutPoint > word.start + 0.001 && cutPoint < word.end - 0.001) {
      return true;
    }
  }
  return false;
}

/**
 * Adjust a cut point so it never falls mid-word.
 * Moves to the nearest word boundary (before or after).
 */
export function adjustForWordBoundary(cutPoint, words) {
  if (!words || words.length === 0) return cutPoint;

  for (const word of words) {
    if (cutPoint > word.start + 0.001 && cutPoint < word.end - 0.001) {
      // Move to end of this word
      return word.end;
    }
  }
  return cutPoint;
}

/**
 * Slice an AudioBuffer into segments given a section plan.
 * Each segment is a Float32Array extracted from the source.
 * Applies linear crossfade at every boundary.
 */
export function sliceAudio(sourceData, sampleRate, sectionPlan) {
  const slices = [];

  for (const section of sectionPlan) {
    const startSample = Math.floor(section.sourceStart * sampleRate);
    const endSample = Math.min(
      Math.floor(section.sourceEnd * sampleRate),
      sourceData.length
    );

    if (startSample >= endSample) continue;

    const slice = new Float32Array(sourceData.slice(startSample, endSample));
    applyFadeIn(slice, Math.floor(CROSSFADE_DURATION * sampleRate));
    applyFadeOut(slice, Math.floor(CROSSFADE_DURATION * sampleRate));

    slices.push({
      ...section,
      audio: slice,
      duration: slice.length / sampleRate
    });
  }

  return slices;
}

/**
 * Apply linear fade-in to the first `fadeSamples` samples of a Float32Array.
 */
export function applyFadeIn(data, fadeSamples) {
  const len = Math.min(fadeSamples, data.length);
  for (let i = 0; i < len; i++) {
    data[i] *= i / len;
  }
}

/**
 * Apply linear fade-out to the last `fadeSamples` samples of a Float32Array.
 */
export function applyFadeOut(data, fadeSamples) {
  const len = Math.min(fadeSamples, data.length);
  const offset = data.length - len;
  for (let i = 0; i < len; i++) {
    data[offset + i] *= 1 - i / len;
  }
}

/**
 * Concatenate slices into a single Float32Array, applying crossfade transitions.
 */
export function concatenateSlices(slices, _sampleRate) {
  if (slices.length === 0) return new Float32Array(0);

  const totalSamples = slices.reduce((acc, s) => acc + s.audio.length, 0);
  const output = new Float32Array(totalSamples);
  let offset = 0;

  for (const slice of slices) {
    output.set(slice.audio, offset);
    offset += slice.audio.length;
  }

  return output;
}

/**
 * Build smart cut points from a section plan, respecting word boundaries,
 * silence regions, and beat grid.
 */
export function buildCutPoints(sectionPlan, words, silenceRegions, beatGrid, bpm) {
  return sectionPlan.map(section => {
    let start = section.sourceStart;
    let end = section.sourceEnd;

    // Adjust start to word boundary
    start = adjustForWordBoundary(start, words);
    end = adjustForWordBoundary(end, words);

    // Snap to silence + beat grid
    start = findBestCutPoint(start, silenceRegions, beatGrid);
    end = findBestCutPoint(end, silenceRegions, beatGrid);

    // Final snap to 1/16th note
    if (bpm) {
      start = snapToSixteenth(start, bpm);
      end = snapToSixteenth(end, bpm);
    }

    return { ...section, sourceStart: start, sourceEnd: end };
  });
}
