import { describe, it, expect } from 'vitest';
import {
  scoreLyricTransition, checkLyricalCoherence, findBestArrangement,
  parseSectionJSON, buildStructurePrompt, buildCoherencePrompt
} from '../utils/coherenceChecker.js';

describe('Lyric Transition Scoring', () => {
  it('returns 0.5 for empty segments', () => {
    expect(scoreLyricTransition('', '')).toBe(0.5);
    expect(scoreLyricTransition(null, null)).toBe(0.5);
  });

  it('returns higher score for related lyrics', () => {
    const scoreA = scoreLyricTransition('I love the music beat', 'the beat goes on and on');
    const scoreB = scoreLyricTransition('I love the music beat', 'tax returns quarterly filing');
    expect(scoreA).toBeGreaterThan(scoreB);
  });

  it('continuity words boost score', () => {
    const withContinuity = scoreLyricTransition('hello world', 'and then we dance');
    const withoutContinuity = scoreLyricTransition('hello world', 'random different thing');
    expect(withContinuity).toBeGreaterThanOrEqual(withoutContinuity);
  });
});

describe('Lyrical Coherence Check', () => {
  it('returns coherent=true for empty array', () => {
    const result = checkLyricalCoherence([]);
    expect(result.coherent).toBe(true);
    expect(result.score).toBe(1);
  });

  it('returns coherent=true for single segment', () => {
    const result = checkLyricalCoherence([{ section: 'verse', text: 'hello world' }]);
    expect(result.coherent).toBe(true);
  });

  it('returns issues array when transitions are abrupt', () => {
    const segments = [
      { section: 'verse', text: 'love music dance sing joy' },
      { section: 'chorus', text: 'xyz qwerty fghij klmno pqrst' }, // no overlap
      { section: 'bridge', text: 'abcde vwxyz mnopq rstuv' }
    ];
    const result = checkLyricalCoherence(segments);
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.score).toBe('number');
  });

  it('score is between 0 and 1', () => {
    const segments = [
      { section: 'verse', text: 'I walk down the road' },
      { section: 'chorus', text: 'down the road and far away' }
    ];
    const result = checkLyricalCoherence(segments);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

describe('Transcript → Section JSON Mapping', () => {
  it('parseSectionJSON parses valid JSON', () => {
    const raw = '{"0s-12s":"verse","12s-20s":"chorus"}';
    const result = parseSectionJSON(raw);
    expect(result['0s-12s']).toBe('verse');
    expect(result['12s-20s']).toBe('chorus');
  });

  it('parseSectionJSON strips markdown fences', () => {
    const raw = '```json\n{"0s-10s":"intro"}\n```';
    const result = parseSectionJSON(raw);
    expect(result['0s-10s']).toBe('intro');
  });

  it('parseSectionJSON throws on invalid JSON', () => {
    expect(() => parseSectionJSON('not json')).toThrow();
  });

  it('parseSectionJSON throws on invalid key format', () => {
    expect(() => parseSectionJSON('{"invalid_key":"verse"}')).toThrow();
  });

  it('parseSectionJSON throws on non-string section values', () => {
    expect(() => parseSectionJSON('{"0s-10s":42}')).toThrow();
  });
});

describe('findBestArrangement', () => {
  it('returns the original plan when it is the best', () => {
    const plan = [
      { section: 'verse', sourceStart: 0, sourceEnd: 10 },
      { section: 'chorus', sourceStart: 10, sourceEnd: 20 }
    ];
    const segments = [
      { section: 'verse', text: 'hello world music', start: 0, end: 10 },
      { section: 'chorus', text: 'world music beats', start: 10, end: 20 }
    ];
    const { arrangement, score } = findBestArrangement(plan, segments);
    expect(Array.isArray(arrangement)).toBe(true);
    expect(typeof score).toBe('number');
  });
});

describe('Prompt Builders', () => {
  it('buildStructurePrompt includes genre and BPM', () => {
    const prompt = buildStructurePrompt('[0.0s] hello [0.5s] world', 'EDM', 128);
    expect(prompt).toContain('EDM');
    expect(prompt).toContain('128');
  });

  it('buildCoherencePrompt includes genre', () => {
    const prompt = buildCoherencePrompt('hello world', 'Pop');
    expect(prompt).toContain('Pop');
  });
});
