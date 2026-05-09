import { describe, it, expect } from 'vitest';
import {
  pitchShift, applyStutter, applyReverb, generateHarmonyLayers,
  mixLayers, applyAutoTune, snapFrequencyToScale, detectPitchAutocorrelation,
  applyTripletSlicing
} from '../utils/audioEffects.js';

const SR = 44100;

function sineWave(freq, durationSec, sr = SR) {
  const n = Math.floor(sr * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin(2 * Math.PI * freq * i / sr);
  return out;
}

describe('Pitch Shifting', () => {
  it('pitchShift returns Float32Array', () => {
    const audio = sineWave(440, 0.1);
    const result = pitchShift(audio, 2);
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('pitchShift by 0 semitones returns identical-length audio', () => {
    const audio = sineWave(440, 0.1);
    const result = pitchShift(audio, 0);
    expect(result.length).toBe(audio.length);
  });

  it('pitchShift up shortens the output (higher pitch = fewer samples)', () => {
    const audio = sineWave(440, 0.5);
    const up = pitchShift(audio, 12); // 1 octave up
    expect(up.length).toBeLessThan(audio.length);
  });

  it('pitchShift down lengthens the output', () => {
    const audio = sineWave(440, 0.5);
    const down = pitchShift(audio, -12);
    expect(down.length).toBeGreaterThan(audio.length);
  });
});

describe('Auto-Tune', () => {
  it('snapFrequencyToScale snaps 443Hz to nearest C major note', () => {
    // 443 Hz is close to A4 (440 Hz), which is in C major
    const snapped = snapFrequencyToScale(443, 'C', 'major');
    expect(snapped).toBeGreaterThan(430);
    expect(snapped).toBeLessThan(470);
  });

  it('snapFrequencyToScale returns 0 for frequency 0', () => {
    expect(snapFrequencyToScale(0, 'C', 'major')).toBe(0);
  });

  it('detectPitchAutocorrelation returns frequency within range', () => {
    const frame = sineWave(440, 0.05); // A4 tone
    const freq = detectPitchAutocorrelation(frame, SR);
    // Expect close to 440 Hz — autocorrelation is approximate
    expect(freq).toBeGreaterThan(300);
    expect(freq).toBeLessThan(600);
  });

  it('applyAutoTune returns same-length audio', () => {
    const audio = sineWave(440, 0.2);
    const result = applyAutoTune(audio, SR, 'C', 'major');
    expect(result.length).toBe(audio.length);
  });
});

describe('Harmony Layers', () => {
  it('generateHarmonyLayers returns 2 layers by default', () => {
    const audio = sineWave(440, 0.2);
    const layers = generateHarmonyLayers(audio);
    expect(layers).toHaveLength(2);
  });

  it('harmony layers are Float32Arrays', () => {
    const audio = sineWave(440, 0.2);
    const layers = generateHarmonyLayers(audio);
    for (const layer of layers) {
      expect(layer).toBeInstanceOf(Float32Array);
    }
  });

  it('harmony layers are attenuated (max amplitude < source)', () => {
    const audio = sineWave(440, 0.2);
    const layers = generateHarmonyLayers(audio);
    const srcMax = Math.max(...audio);
    const layerMax = Math.max(...layers[0]);
    expect(layerMax).toBeLessThan(srcMax);
  });

  it('mixLayers combines correctly into single Float32Array', () => {
    const a = new Float32Array([1, 1, 1, 1]);
    const b = new Float32Array([0, 0, 0, 0]);
    const mixed = mixLayers([a, b], [0.5, 0.5]);
    expect(mixed).toBeInstanceOf(Float32Array);
    expect(mixed[0]).toBeCloseTo(0.5, 5);
  });
});

describe('Stutter Effect', () => {
  it('applyStutter returns same-length audio', () => {
    const audio = sineWave(440, 0.5);
    const result = applyStutter(audio, SR, 128, 0.25);
    expect(result.length).toBe(audio.length);
  });

  it('applyStutter introduces silence (second cell should be zeroed)', () => {
    const bpm = 120;
    const stutterFraction = 0.25;
    const audio = new Float32Array(SR).fill(1); // DC signal = 1
    const result = applyStutter(audio, SR, bpm, stutterFraction);
    // Find the second "cell" which should be silent
    const cellSamples = Math.floor((60 / bpm) * stutterFraction * SR);
    // Cell 2 (silent) starts at cellSamples
    expect(result[cellSamples + 1]).toBeCloseTo(0, 5);
  });
});

describe('Reverb Effect', () => {
  it('applyReverb returns same-length audio', () => {
    const audio = sineWave(440, 0.2);
    const result = applyReverb(audio, SR);
    expect(result.length).toBe(audio.length);
  });

  it('applyReverb with mix=0 returns original audio', () => {
    const audio = sineWave(440, 0.1);
    const result = applyReverb(audio, SR, 1.0, 0);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(audio[i], 5);
    }
  });
});

describe('Triplet Slicing', () => {
  it('applyTripletSlicing returns Float32Array of same length', () => {
    const audio = sineWave(440, 0.5);
    const result = applyTripletSlicing(audio, SR, 140);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(audio.length);
  });
});
