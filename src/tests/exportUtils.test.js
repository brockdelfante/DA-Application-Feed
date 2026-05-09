import { describe, it, expect, vi } from 'vitest';
import { encodeWAV, validateWAV, validateMP3, buildExportZIP, validateZIPStructure } from '../utils/exportUtils.js';

function makeSineData(samples = 44100) {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) out[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.8;
  return out;
}

describe('WAV Encoding', () => {
  it('encodeWAV produces a valid ArrayBuffer', () => {
    const audio = makeSineData(4410); // 0.1s
    const buffer = encodeWAV(audio, 44100);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('encodeWAV output is larger than raw PCM data', () => {
    const audio = makeSineData(4410);
    const buffer = encodeWAV(audio, 44100);
    // 44 bytes header + 2 bytes per sample
    expect(buffer.byteLength).toBe(44 + audio.length * 2);
  });

  it('validateWAV confirms RIFF WAVE header', () => {
    const audio = makeSineData(4410);
    const buffer = encodeWAV(audio, 44100);
    expect(validateWAV(buffer)).toBe(true);
  });

  it('validateWAV rejects random bytes', () => {
    const random = new ArrayBuffer(100);
    new Uint8Array(random).fill(0xAB);
    expect(validateWAV(random)).toBe(false);
  });

  it('validateWAV rejects buffer smaller than 44 bytes', () => {
    expect(validateWAV(new ArrayBuffer(10))).toBe(false);
  });
});

describe('MP3 Validation', () => {
  it('validateMP3 accepts ID3 header (0x49 0x44 0x33)', () => {
    const data = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
    expect(validateMP3(data)).toBe(true);
  });

  it('validateMP3 accepts MPEG sync word (0xFF 0xFB)', () => {
    const data = new Uint8Array([0xFF, 0xFB, 0x90, 0x00]);
    expect(validateMP3(data)).toBe(true);
  });

  it('validateMP3 rejects invalid data', () => {
    const data = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    expect(validateMP3(data)).toBe(false);
  });

  it('validateMP3 rejects null/empty', () => {
    expect(validateMP3(null)).toBe(false);
    expect(validateMP3(new Uint8Array(0))).toBe(false);
  });
});

describe('ZIP Export Structure', () => {
  it('buildExportZIP returns a Blob', async () => {
    const audio = makeSineData(4410);
    const wavBuffer = encodeWAV(audio, 44100);
    const stems = [
      { section: 'verse', wavData: wavBuffer },
      { section: 'chorus', wavData: wavBuffer }
    ];
    const originalData = new Uint8Array([0xFF, 0xFB, 0x90, 0x00]); // fake MP3

    const zip = await buildExportZIP(
      originalData,
      { wav: wavBuffer, mp3: null },
      stems,
      { genre: 'Pop', bpm: 120 }
    );

    expect(zip).toBeInstanceOf(Blob);
    expect(zip.size).toBeGreaterThan(0);
  });

  it('ZIP contains full_mix.wav', async () => {
    const audio = makeSineData(4410);
    const wavBuffer = encodeWAV(audio, 44100);
    const stems = [{ section: 'verse', wavData: wavBuffer }];

    const zip = await buildExportZIP(
      null,
      { wav: wavBuffer, mp3: null },
      stems,
      {}
    );

    const result = await validateZIPStructure(zip);
    expect(result.hasFullMixWav).toBe(true);
  });

  it('ZIP contains stems folder', async () => {
    const audio = makeSineData(4410);
    const wavBuffer = encodeWAV(audio, 44100);
    const stems = [
      { section: 'verse', wavData: wavBuffer },
      { section: 'chorus', wavData: wavBuffer }
    ];

    const zip = await buildExportZIP(null, { wav: wavBuffer }, stems, {});
    const result = await validateZIPStructure(zip);
    expect(result.hasStems).toBe(true);
  });

  it('ZIP validation returns all file names', async () => {
    const audio = makeSineData(4410);
    const wavBuffer = encodeWAV(audio, 44100);

    const zip = await buildExportZIP(null, { wav: wavBuffer }, [{ section: 'intro', wavData: wavBuffer }], {});
    const result = await validateZIPStructure(zip);
    expect(Array.isArray(result.files)).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
  });
});

describe('MP3 Upload and Decoding (mocked AudioContext)', () => {
  it('decodeAudioFile resolves with audioData and sampleRate', async () => {
    const { decodeAudioFile } = await import('../utils/exportUtils.js');
    // Create a minimal fake "File" with an arrayBuffer method
    const fakeFile = {
      name: 'test.mp3',
      type: 'audio/mp3',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
    };
    const result = await decodeAudioFile(fakeFile);
    expect(result).toHaveProperty('audioData');
    expect(result).toHaveProperty('sampleRate');
    expect(result.audioData).toBeInstanceOf(Float32Array);
    expect(result.sampleRate).toBe(44100);
  });
});
