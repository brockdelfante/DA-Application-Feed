import { describe, it, expect } from 'vitest';
import { detectBPM, computeBeatGrid, snapToSixteenth, nearestBeat } from '../utils/bpmDetection.js';

/**
 * Generate a synthetic audio buffer with energy pulses at a given BPM.
 */
function makePulseTrain(bpm, sampleRate = 44100, durationSec = 4) {
  const samples = sampleRate * durationSec;
  const buffer = new Float32Array(samples);
  const beatSamples = Math.round((60 / bpm) * sampleRate);

  for (let i = 0; i < samples; i += beatSamples) {
    // Gaussian pulse centred on each beat
    for (let j = 0; j < 200 && i + j < samples; j++) {
      buffer[i + j] = Math.exp(-((j - 100) ** 2) / 500);
    }
  }
  return buffer;
}

describe('BPM Detection', () => {
  it('detects 120 BPM within ±5 BPM', () => {
    const audio = makePulseTrain(120);
    const bpm = detectBPM(audio, 44100);
    expect(bpm).toBeGreaterThanOrEqual(115);
    expect(bpm).toBeLessThanOrEqual(125);
  });

  it('detects 90 BPM within ±5 BPM', () => {
    const audio = makePulseTrain(90);
    const bpm = detectBPM(audio, 44100);
    expect(bpm).toBeGreaterThanOrEqual(85);
    expect(bpm).toBeLessThanOrEqual(95);
  });

  it('returns integer BPM', () => {
    const audio = makePulseTrain(128);
    const bpm = detectBPM(audio, 44100);
    expect(Number.isInteger(bpm)).toBe(true);
  });

  it('clamps result to 60–180 range', () => {
    const audio = new Float32Array(44100 * 2).fill(0.01); // noise only
    const bpm = detectBPM(audio, 44100);
    expect(bpm).toBeGreaterThanOrEqual(60);
    expect(bpm).toBeLessThanOrEqual(180);
  });
});

describe('Beat Grid', () => {
  it('computes correct number of beats for duration', () => {
    const bpm = 120;
    const duration = 4; // 4 seconds → 8 beats at 120 BPM
    const grid = computeBeatGrid(bpm, duration);
    expect(grid.length).toBe(8);
  });

  it('first beat is at 0', () => {
    const grid = computeBeatGrid(120, 4);
    expect(grid[0]).toBe(0);
  });

  it('beat spacing matches BPM', () => {
    const bpm = 120;
    const grid = computeBeatGrid(bpm, 4);
    const expectedSpacing = 60 / bpm; // 0.5s
    expect(grid[1] - grid[0]).toBeCloseTo(expectedSpacing, 3);
  });

  it('snaps time to nearest 1/16th note', () => {
    const bpm = 120;
    const sixteenth = (60 / bpm) / 4; // 0.125s
    const snapped = snapToSixteenth(0.13, bpm);
    expect(snapped % sixteenth).toBeCloseTo(0, 3);
  });

  it('nearestBeat returns closest beat within tolerance', () => {
    const grid = [0, 0.5, 1.0, 1.5, 2.0];
    expect(nearestBeat(0.48, grid)).toBeCloseTo(0.5, 2);
    expect(nearestBeat(0.2, grid)).toBeCloseTo(0.2, 2); // outside tolerance, unchanged
  });
});
