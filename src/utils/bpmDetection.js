/**
 * BPM detection using Meyda energy analysis + autocorrelation.
 * Returns detected BPM rounded to nearest integer.
 */

export function detectBPM(audioBuffer, sampleRate = 44100) {
  const bufferSize = 512;
  const hopSize = 256;
  const energyValues = [];

  // Compute RMS energy frames
  for (let i = 0; i + bufferSize < audioBuffer.length; i += hopSize) {
    const frame = audioBuffer.slice(i, i + bufferSize);
    let sum = 0;
    for (let j = 0; j < frame.length; j++) {
      sum += frame[j] * frame[j];
    }
    energyValues.push(Math.sqrt(sum / frame.length));
  }

  // Onset detection via energy flux
  const onsets = [];
  for (let i = 1; i < energyValues.length; i++) {
    const flux = energyValues[i] - energyValues[i - 1];
    if (flux > 0) onsets.push(flux);
    else onsets.push(0);
  }

  // Autocorrelation over onset curve
  const minBPM = 60;
  const maxBPM = 180;
  const framesPerSecond = sampleRate / hopSize;

  let bestBPM = 120;
  let bestCorr = -Infinity;

  for (let bpm = minBPM; bpm <= maxBPM; bpm++) {
    const period = Math.round((60 / bpm) * framesPerSecond);
    if (period <= 0 || period >= onsets.length) continue;

    let corr = 0;
    const len = onsets.length - period;
    for (let i = 0; i < len; i++) {
      corr += onsets[i] * onsets[i + period];
    }
    corr /= len;

    if (corr > bestCorr) {
      bestCorr = corr;
      bestBPM = bpm;
    }
  }

  return Math.round(bestBPM);
}

/**
 * Compute beat grid positions (in seconds) from BPM over a given duration.
 */
export function computeBeatGrid(bpm, duration, _beatsPerBar = 4) {
  const beatDuration = 60 / bpm;
  const beats = [];
  for (let t = 0; t < duration; t += beatDuration) {
    beats.push(parseFloat(t.toFixed(4)));
  }
  return beats;
}

/**
 * Snap a time value (seconds) to the nearest 1/16th note at a given BPM.
 */
export function snapToSixteenth(timeSeconds, bpm) {
  const sixteenth = (60 / bpm) / 4;
  return Math.round(timeSeconds / sixteenth) * sixteenth;
}

/**
 * Find the nearest beat position to a given time within tolerance.
 */
export function nearestBeat(timeSeconds, beatGrid, toleranceSeconds = 0.05) {
  let closest = beatGrid[0];
  let minDist = Math.abs(timeSeconds - beatGrid[0]);
  for (const beat of beatGrid) {
    const dist = Math.abs(timeSeconds - beat);
    if (dist < minDist) {
      minDist = dist;
      closest = beat;
    }
  }
  return minDist <= toleranceSeconds ? closest : timeSeconds;
}
