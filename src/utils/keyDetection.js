/**
 * Key detection using chroma vector analysis (Krumhansl-Schmuckler key profiles).
 */

// Note names for display
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Schmuckler key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(chroma, profile) {
  const n = 12;
  const meanC = chroma.reduce((a, b) => a + b, 0) / n;
  const meanP = profile.reduce((a, b) => a + b, 0) / n;
  let num = 0, dc = 0, dp = 0;
  for (let i = 0; i < n; i++) {
    const c = chroma[i] - meanC;
    const p = profile[i] - meanP;
    num += c * p;
    dc += c * c;
    dp += p * p;
  }
  const denom = Math.sqrt(dc * dp);
  return denom === 0 ? 0 : num / denom;
}

function rotate(arr, n) {
  return [...arr.slice(n), ...arr.slice(0, n)];
}

/**
 * Compute a simple chroma vector from a float32 audio buffer.
 * Uses FFT-approximation by binning frequencies into 12 pitch classes.
 */
export function computeChroma(audioData, sampleRate = 44100) {
  const chroma = new Array(12).fill(0);
  const N = Math.min(audioData.length, 4096);

  // Real FFT (naive DFT for correctness — performance acceptable on N=4096)
  for (let k = 1; k < N / 2; k++) {
    const freq = (k * sampleRate) / N;
    if (freq < 20 || freq > 8000) continue;

    // Map freq to MIDI note → pitch class
    const midi = Math.round(12 * Math.log2(freq / 440) + 69);
    const pc = ((midi % 12) + 12) % 12;

    // Accumulate magnitude
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      re += audioData[n] * Math.cos(angle);
      im -= audioData[n] * Math.sin(angle);
    }
    chroma[pc] += Math.sqrt(re * re + im * im);
  }

  // Normalize
  const max = Math.max(...chroma, 1e-9);
  return chroma.map(v => v / max);
}

/**
 * Detect the musical key from an audio buffer.
 * Returns { note: 'C', mode: 'major', label: 'C Major', confidence: 0.85 }
 */
export function detectKey(audioData, sampleRate = 44100) {
  const chroma = computeChroma(audioData, sampleRate);

  let bestScore = -Infinity;
  let bestNote = 0;
  let bestMode = 'major';

  for (let root = 0; root < 12; root++) {
    const majorScore = correlation(chroma, rotate(MAJOR_PROFILE, root));
    const minorScore = correlation(chroma, rotate(MINOR_PROFILE, root));

    if (majorScore > bestScore) {
      bestScore = majorScore;
      bestNote = root;
      bestMode = 'major';
    }
    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestNote = root;
      bestMode = 'minor';
    }
  }

  return {
    note: NOTE_NAMES[bestNote],
    noteIndex: bestNote,
    mode: bestMode,
    label: `${NOTE_NAMES[bestNote]} ${bestMode.charAt(0).toUpperCase() + bestMode.slice(1)}`,
    confidence: parseFloat(((bestScore + 1) / 2).toFixed(2))
  };
}

/**
 * Compute semitone distance from sourceKey to targetKey for pitch shifting.
 */
export function semitoneDistance(sourceNote, targetNote) {
  const src = NOTE_NAMES.indexOf(sourceNote);
  const tgt = NOTE_NAMES.indexOf(targetNote);
  if (src === -1 || tgt === -1) return 0;
  let diff = tgt - src;
  // Take the shortest path
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  return diff;
}

/**
 * Return all notes in a given key's scale (major or minor).
 */
export function getScaleNotes(rootNote, mode) {
  const root = NOTE_NAMES.indexOf(rootNote);
  if (root === -1) return [];
  const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
  const minorIntervals = [0, 2, 3, 5, 7, 8, 10];
  const intervals = mode === 'major' ? majorIntervals : minorIntervals;
  return intervals.map(i => NOTE_NAMES[(root + i) % 12]);
}

/** All available key labels for the UI selector. */
export const ALL_KEYS = NOTE_NAMES.flatMap(note => [
  `${note} Major`,
  `${note} Minor`
]);

/** Parse a key label like "C Major" → { note: 'C', mode: 'major' } */
export function parseKeyLabel(label) {
  const parts = label.split(' ');
  return { note: parts[0], mode: parts[1]?.toLowerCase() ?? 'major' };
}
