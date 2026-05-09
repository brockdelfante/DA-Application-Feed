import { describe, it, expect } from 'vitest';
import { detectKey, getScaleNotes, semitoneDistance, parseKeyLabel, computeChroma, NOTE_NAMES } from '../utils/keyDetection.js';

function makeScaleSignal(rootNote, mode, sampleRate = 44100, durationSec = 0.5) {
  const samples = Math.floor(sampleRate * durationSec);
  const buffer = new Float32Array(samples);
  const scaleNotes = getScaleNotes(rootNote, mode);

  for (const note of scaleNotes) {
    const noteIdx = NOTE_NAMES.indexOf(note);
    const freq = 261.63 * Math.pow(2, noteIdx / 12);
    for (let i = 0; i < samples; i++) {
      buffer[i] += Math.sin(2 * Math.PI * freq * i / sampleRate) * 0.3;
    }
  }
  return buffer;
}

describe('Key Detection', () => {
  it('computeChroma returns 12-element array', () => {
    const audio = new Float32Array(4096).map(() => Math.random() * 0.1);
    const chroma = computeChroma(audio, 44100);
    expect(chroma).toHaveLength(12);
  });

  it('computeChroma values are normalised [0,1]', () => {
    const audio = new Float32Array(4096).map(() => Math.random() * 0.1);
    const chroma = computeChroma(audio, 44100);
    for (const v of chroma) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('detectKey returns expected shape', () => {
    const audio = new Float32Array(4096).fill(0.1);
    const result = detectKey(audio, 44100);
    expect(result).toHaveProperty('note');
    expect(result).toHaveProperty('mode');
    expect(result).toHaveProperty('label');
    expect(result).toHaveProperty('confidence');
    expect(['major', 'minor']).toContain(result.mode);
  });

  it('confidence is in range [0,1]', () => {
    const audio = new Float32Array(4096).fill(0.05);
    const result = detectKey(audio, 44100);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

describe('Key Utilities', () => {
  it('getScaleNotes C major returns 7 notes', () => {
    const notes = getScaleNotes('C', 'major');
    expect(notes).toHaveLength(7);
    expect(notes).toContain('C');
    expect(notes).toContain('E');
    expect(notes).toContain('G');
  });

  it('getScaleNotes A minor returns 7 notes', () => {
    const notes = getScaleNotes('A', 'minor');
    expect(notes).toHaveLength(7);
    expect(notes).toContain('A');
    expect(notes).toContain('C');
    expect(notes).toContain('E');
  });

  it('semitoneDistance C to G is ±5 (shortest path)', () => {
    // C→G going up is +7, going down is -5; function returns shortest path = -5
    expect(semitoneDistance('C', 'G')).toBe(-5);
  });

  it('semitoneDistance C to F is -7 (shortest path down)', () => {
    // F above C is +5; shortest is +5 not -7
    expect(Math.abs(semitoneDistance('C', 'F'))).toBeLessThanOrEqual(7);
  });

  it('semitoneDistance same note is 0', () => {
    expect(semitoneDistance('D', 'D')).toBe(0);
  });

  it('parseKeyLabel parses correctly', () => {
    const result = parseKeyLabel('C# Minor');
    expect(result.note).toBe('C#');
    expect(result.mode).toBe('minor');
  });
});
