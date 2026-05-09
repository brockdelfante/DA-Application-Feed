import { describe, it, expect } from 'vitest';
import { GENRE_TEMPLATES, GENRES, buildSectionPlan, barDuration } from '../utils/genreTemplates.js';

describe('Genre Templates', () => {
  it('exports all 6 genres', () => {
    expect(GENRES).toHaveLength(6);
    expect(GENRES).toContain('EDM');
    expect(GENRES).toContain('Hip-Hop');
    expect(GENRES).toContain('Pop');
    expect(GENRES).toContain('Trap');
    expect(GENRES).toContain('House');
    expect(GENRES).toContain('Techno');
  });

  it.each(GENRES)('%s template has required fields', (genre) => {
    const tmpl = GENRE_TEMPLATES[genre];
    expect(tmpl).toBeDefined();
    expect(tmpl).toHaveProperty('structure');
    expect(tmpl).toHaveProperty('bpmRange');
    expect(tmpl).toHaveProperty('defaultBPM');
    expect(tmpl).toHaveProperty('effects');
    expect(Array.isArray(tmpl.structure)).toBe(true);
    expect(tmpl.structure.length).toBeGreaterThan(0);
  });

  it.each(GENRES)('%s structure sections all have name + bars + effects', (genre) => {
    const { structure } = GENRE_TEMPLATES[genre];
    for (const section of structure) {
      expect(section).toHaveProperty('name');
      expect(section).toHaveProperty('bars');
      expect(section).toHaveProperty('effects');
      expect(Array.isArray(section.bars)).toBe(true);
      expect(section.bars).toHaveLength(2);
      expect(section.bars[0]).toBeLessThanOrEqual(section.bars[1]);
    }
  });

  it('EDM has a drop section', () => {
    const { structure } = GENRE_TEMPLATES['EDM'];
    expect(structure.some(s => s.name === 'drop')).toBe(true);
  });

  it('Pop chorus has harmony effect', () => {
    const { structure } = GENRE_TEMPLATES['Pop'];
    const chorus = structure.find(s => s.name === 'chorus');
    expect(chorus).toBeDefined();
    expect(chorus.effects).toContain('harmony');
  });

  it('Trap has auto_tune in chorus', () => {
    const { structure } = GENRE_TEMPLATES['Trap'];
    const chorus = structure.find(s => s.name === 'chorus');
    expect(chorus).toBeDefined();
    expect(chorus.effects).toContain('auto_tune');
  });

  it('House has breakdown section', () => {
    const { structure } = GENRE_TEMPLATES['House'];
    expect(structure.some(s => s.name === 'breakdown')).toBe(true);
  });

  it('Techno has build section', () => {
    const { structure } = GENRE_TEMPLATES['Techno'];
    expect(structure.some(s => s.name === 'build')).toBe(true);
  });
});

describe('Section Plan Builder', () => {
  const sectionMap = {
    '0s-20s': 'intro',
    '20s-50s': 'verse',
    '50s-70s': 'chorus',
    '70s-90s': 'bridge',
    '90s-120s': 'outro'
  };

  it('builds a plan with correct number of sections', () => {
    const plan = buildSectionPlan(sectionMap, 'Pop', 120, 120);
    expect(plan.length).toBe(GENRE_TEMPLATES['Pop'].structure.length);
  });

  it('plan sections cover sequential time ranges', () => {
    const plan = buildSectionPlan(sectionMap, 'Pop', 120, 120);
    for (let i = 0; i < plan.length - 1; i++) {
      expect(plan[i].targetEnd).toBeCloseTo(plan[i + 1].targetStart, 2);
    }
  });

  it('barDuration at 120 BPM is 2 seconds', () => {
    expect(barDuration(120)).toBe(2);
  });

  it('barDuration at 128 BPM is correct', () => {
    expect(barDuration(128)).toBeCloseTo(1.875, 3);
  });

  it('throws on unknown genre', () => {
    expect(() => buildSectionPlan(sectionMap, 'Unknown', 120, 120)).toThrow();
  });
});
