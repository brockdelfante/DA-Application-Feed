import { describe, it, expect } from 'vitest';
import { parseDateSourced } from './dateParser';

describe('parseDateSourced', () => {
  it('should parse a date string with time', () => {
    const date = parseDateSourced('30/04/2026 03:32');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(3); // April is 3
    expect(date.getDate()).toBe(30);
    expect(date.getHours()).toBe(3);
    expect(date.getMinutes()).toBe(32);
  });

  it('should parse a date string without time', () => {
    const date = parseDateSourced('01/05/2026');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4); // May is 4
    expect(date.getDate()).toBe(1);
  });

  it('should return epoch for empty string', () => {
    const date = parseDateSourced('');
    expect(date.getTime()).toBe(0);
  });
});
