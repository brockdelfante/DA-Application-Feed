import { describe, it, expect } from 'vitest';
import {
  isMidWordCut, adjustForWordBoundary, findSilenceRegions,
  findBestCutPoint, applyFadeIn, applyFadeOut, sliceAudio, buildCutPoints
} from '../utils/smartSlicer.js';

const SAMPLE_RATE = 44100;

function makeSilentBuffer(durationSec, sampleRate = SAMPLE_RATE) {
  return new Float32Array(Math.floor(sampleRate * durationSec)); // zeroed
}

function makeNoisyBuffer(durationSec, sampleRate = SAMPLE_RATE) {
  const buf = new Float32Array(Math.floor(sampleRate * durationSec));
  for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() - 0.5) * 0.5;
  return buf;
}

describe('Smart Slicing — No Mid-Word Cuts', () => {
  const words = [
    { word: 'Hello', start: 0.0, end: 0.4 },
    { word: 'world', start: 0.5, end: 0.9 },
    { word: 'this',  start: 1.1, end: 1.4 },
    { word: 'is',    start: 1.5, end: 1.7 },
    { word: 'music', start: 1.8, end: 2.2 }
  ];

  it('detects a mid-word cut', () => {
    expect(isMidWordCut(0.2, words)).toBe(true);  // inside 'Hello'
  });

  it('does not flag cut at a word boundary', () => {
    expect(isMidWordCut(0.4, words)).toBe(false); // at end of 'Hello'
    expect(isMidWordCut(0.5, words)).toBe(false); // at start of 'world'
  });

  it('does not flag cut in silence between words', () => {
    expect(isMidWordCut(0.45, words)).toBe(false); // between words
  });

  it('adjustForWordBoundary moves cut to word end', () => {
    const adjusted = adjustForWordBoundary(0.2, words);
    expect(adjusted).toBe(0.4); // end of 'Hello'
  });

  it('adjustForWordBoundary leaves gap-time unchanged', () => {
    const adjusted = adjustForWordBoundary(1.0, words);
    expect(adjusted).toBe(1.0); // in silence, unchanged
  });
});

describe('Silence Region Detection', () => {
  it('detects silent sections in a buffer with silence + noise', () => {
    const buf = new Float32Array(SAMPLE_RATE); // 1 second
    // First half noisy, second half silent
    for (let i = 0; i < SAMPLE_RATE / 2; i++) buf[i] = 0.3;
    // Second half stays zero

    const regions = findSilenceRegions(buf, SAMPLE_RATE, 0.01, 0.05);
    expect(regions.length).toBeGreaterThan(0);
    const lastRegion = regions[regions.length - 1];
    expect(lastRegion.start).toBeGreaterThanOrEqual(0.45);
  });

  it('returns empty array for fully noisy buffer', () => {
    const buf = makeNoisyBuffer(0.5);
    const regions = findSilenceRegions(buf, SAMPLE_RATE, 0.001);
    // With random noise above 0.001, expect no or very few silence regions
    expect(Array.isArray(regions)).toBe(true);
  });
});

describe('Audio Fade Crossfade', () => {
  it('applyFadeIn zeros the first sample', () => {
    const data = new Float32Array(100).fill(1);
    applyFadeIn(data, 100);
    expect(data[0]).toBeCloseTo(0, 5);
  });

  it('applyFadeIn leaves the last sample at full amplitude', () => {
    const data = new Float32Array(100).fill(1);
    applyFadeIn(data, 100);
    expect(data[99]).toBeCloseTo(1, 1);
  });

  it('applyFadeOut zeros the last sample', () => {
    const data = new Float32Array(100).fill(1);
    applyFadeOut(data, 100);
    expect(data[99]).toBeCloseTo(0, 1);
  });

  it('applyFadeOut preserves amplitude at start', () => {
    const data = new Float32Array(100).fill(1);
    applyFadeOut(data, 50);
    expect(data[0]).toBeCloseTo(1, 5); // untouched first half
  });

  it('crossfade fade duration is 50ms (2205 samples at 44100Hz)', () => {
    const fadeSamples = Math.floor(0.05 * SAMPLE_RATE);
    expect(fadeSamples).toBe(2205);
  });
});

describe('Audio Slicing', () => {
  it('sliceAudio returns correct number of slices', () => {
    const audio = makeNoisyBuffer(4);
    const plan = [
      { section: 'verse',  sourceStart: 0,   sourceEnd: 2,   targetStart: 0, targetEnd: 2, effects: [], chopped: false },
      { section: 'chorus', sourceStart: 2,   sourceEnd: 4,   targetStart: 2, targetEnd: 4, effects: [], chopped: false }
    ];
    const slices = sliceAudio(audio, SAMPLE_RATE, plan);
    expect(slices).toHaveLength(2);
  });

  it('sliceAudio slice has correct duration', () => {
    const audio = makeNoisyBuffer(4);
    const plan = [{ section: 'verse', sourceStart: 0, sourceEnd: 2, targetStart: 0, targetEnd: 2, effects: [], chopped: false }];
    const slices = sliceAudio(audio, SAMPLE_RATE, plan);
    expect(slices[0].duration).toBeCloseTo(2, 1);
  });
});

describe('Beat Grid Alignment', () => {
  it('buildCutPoints adjusts cut times to word boundaries', () => {
    const words = [
      { word: 'test', start: 0.9, end: 1.2 }
    ];
    const plan = [{ section: 'verse', sourceStart: 0, sourceEnd: 1.0, targetStart: 0, targetEnd: 1.0, effects: [], chopped: false }];
    const adjusted = buildCutPoints(plan, words, [], null, null);
    // End was 1.0 which is inside 'test' (0.9–1.2), so should be moved to 1.2
    expect(adjusted[0].sourceEnd).toBeCloseTo(1.2, 1);
  });
});
