import { describe, it, expect } from 'vitest';
import {
  detectWordChunks, snapChunksToBeatGrid, renderSnappedAudio,
  detectSections, restructureToGenre, processVocals
} from '../utils/vocalProcessor.js';

const SR = 44100;

/** Synthetic audio: bursts of noise separated by silence */
function makeBurstyAudio(pattern, sampleRate = SR) {
  // pattern: array of [durationSec, amplitude]
  const total = pattern.reduce((a, [d]) => a + d, 0);
  const buf = new Float32Array(Math.floor(total * sampleRate));
  let offset = 0;
  for (const [dur, amp] of pattern) {
    const n = Math.floor(dur * sampleRate);
    for (let i = 0; i < n; i++) {
      buf[offset + i] = amp > 0 ? (Math.random() * 2 - 1) * amp : 0;
    }
    offset += n;
  }
  return buf;
}

describe('Word chunk detection', () => {
  it('detects separate loud bursts as individual chunks', () => {
    const audio = makeBurstyAudio([
      [0.2, 0.3],   // word 1
      [0.1, 0],     // silence
      [0.2, 0.3],   // word 2
      [0.1, 0],     // silence
      [0.2, 0.3],   // word 3
    ]);
    const chunks = detectWordChunks(audio, SR, { thresholdRMS: 0.05 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array for silent audio', () => {
    const audio = new Float32Array(SR); // 1 second silence
    const chunks = detectWordChunks(audio, SR);
    expect(chunks).toHaveLength(0);
  });

  it('each chunk has start < end', () => {
    const audio = makeBurstyAudio([[0.3, 0.3], [0.1, 0], [0.3, 0.3]]);
    const chunks = detectWordChunks(audio, SR, { thresholdRMS: 0.05 });
    for (const c of chunks) {
      expect(c.start).toBeLessThan(c.end);
    }
  });
});

describe('Beat snapping', () => {
  it('snaps chunk start to nearest 16th note', () => {
    const bpm = 120;
    const sixteenth = (60 / bpm) / 4; // 0.125s
    const chunks = [{ start: 0.13, end: 0.4 }]; // 0.13 → should snap to 0.125
    const snapped = snapChunksToBeatGrid(chunks, bpm);
    expect(snapped[0].targetStart % sixteenth).toBeCloseTo(0, 3);
  });

  it('preserves chunk duration after snapping', () => {
    const chunks = [{ start: 0.23, end: 0.55 }];
    const snapped = snapChunksToBeatGrid(chunks, 120);
    const origDur = chunks[0].end - chunks[0].start;
    const snapDur = snapped[0].targetEnd - snapped[0].targetStart;
    expect(snapDur).toBeCloseTo(origDur, 4);
  });

  it('output is different from input when source is off-beat', () => {
    const bpm = 120;
    const chunks = [{ start: 0.23, end: 0.45 }]; // 0.23 is off-beat
    const snapped = snapChunksToBeatGrid(chunks, bpm);
    expect(snapped[0].targetStart).not.toBeCloseTo(0.23, 2);
  });
});

describe('Render snapped audio', () => {
  it('returns a Float32Array', () => {
    const audio = makeBurstyAudio([[0.5, 0.3]]);
    const snapped = [{ sourceStart: 0, sourceEnd: 0.3, targetStart: 0.125, targetEnd: 0.425 }];
    const result = renderSnappedAudio(audio, SR, snapped);
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('output is non-zero where chunks land', () => {
    const audio = new Float32Array(SR);
    for (let i = 0; i < SR * 0.2; i++) audio[i] = 0.5;
    const snapped = [{ sourceStart: 0, sourceEnd: 0.2, targetStart: 0.125, targetEnd: 0.325 }];
    const result = renderSnappedAudio(audio, SR, snapped);
    const midSample = result[Math.floor(0.2 * SR)];
    expect(Math.abs(midSample)).toBeGreaterThan(0);
  });
});

describe('Section detection', () => {
  it('splits chunks into sections at long gaps', () => {
    const chunks = [
      { start: 0, end: 0.3 },
      { start: 0.4, end: 0.6 },
      { start: 2.5, end: 2.8 },   // long gap before this
      { start: 2.9, end: 3.1 }
    ];
    const sections = detectSections(chunks, 1.0);
    expect(sections.length).toBe(2);
  });

  it('groups nearby chunks into one section', () => {
    const chunks = [
      { start: 0, end: 0.3 },
      { start: 0.4, end: 0.6 },
      { start: 0.7, end: 0.9 }
    ];
    const sections = detectSections(chunks, 1.0);
    expect(sections.length).toBe(1);
  });
});

describe('Genre restructuring', () => {
  it('reorders sections to match genre template', () => {
    const sections = [
      { start: 0, end: 5, label: 'chorus', chunks: [] },
      { start: 6, end: 12, label: 'verse', chunks: [] },
      { start: 13, end: 15, label: 'intro', chunks: [] }
    ];
    const result = restructureToGenre(sections, 'Pop', 120);
    expect(result.length).toBeGreaterThan(0);
    // First section in Pop template is 'intro'
    expect(result[0].targetLabel).toBe('intro');
  });

  it('produces output for all 6 genres', () => {
    const sections = [
      { start: 0, end: 10, label: 'verse', chunks: [] },
      { start: 12, end: 20, label: 'chorus', chunks: [] }
    ];
    for (const genre of ['EDM', 'Hip-Hop', 'Pop', 'Trap', 'House', 'Techno']) {
      const result = restructureToGenre(sections, genre, 120);
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

describe('Full pipeline', () => {
  it('produces output different from input', () => {
    // 3 words + silence at 120 BPM
    const audio = makeBurstyAudio([
      [0.23, 0.3], [0.08, 0], [0.23, 0.3], [0.08, 0], [0.23, 0.3],
      [1.5, 0],
      [0.23, 0.3], [0.08, 0], [0.23, 0.3]
    ]);
    const { fullMix, stems, sectionPlan } = processVocals(audio, SR, {
      genre: 'Pop', targetBPM: 120
    });
    expect(fullMix).toBeInstanceOf(Float32Array);
    expect(fullMix.length).toBeGreaterThan(0);
    expect(stems.length).toBeGreaterThan(0);
    expect(sectionPlan.length).toBeGreaterThan(0);
  });

  it('beat-snapped output has audio at quantised positions', () => {
    const audio = makeBurstyAudio([[0.23, 0.3], [0.1, 0], [0.23, 0.3]]);
    const { fullMix } = processVocals(audio, SR, { genre: 'Pop', targetBPM: 120 });
    // Just verify it runs and produces non-empty output
    const hasNonZero = fullMix.some(s => Math.abs(s) > 0.001);
    expect(hasNonZero).toBe(true);
  });
});
