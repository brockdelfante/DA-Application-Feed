/**
 * Genre templates defining structural section order, bar counts, BPM range, and effects.
 * All bar counts are in bars; sections are ordered for the final arrangement.
 */

export const GENRES = ['EDM', 'Hip-Hop', 'Pop', 'Trap', 'House', 'Techno'];

export const GENRE_TEMPLATES = {
  EDM: {
    label: 'EDM',
    bpmRange: [120, 135],
    defaultBPM: 128,
    structure: [
      { name: 'intro',      bars: [16, 32], effects: ['minimal_vocals', 'reverb'] },
      { name: 'verse',      bars: [8, 16],  effects: ['full_vocals'] },
      { name: 'pre-chorus', bars: [8, 8],   effects: ['full_vocals', 'build'] },
      { name: 'chorus',     bars: [16, 16], effects: ['full_vocals'] },
      { name: 'drop',       bars: [32, 32], effects: ['chopped', 'stutter', 'reverb'] },
      { name: 'bridge',     bars: [8, 8],   effects: ['full_vocals'] },
      { name: 'outro',      bars: [16, 32], effects: ['reverb', 'fade'] }
    ],
    choppedSections: ['drop'],
    effects: { stutter: true, reverb: true, pitchShift: false, autoTune: false, harmony: false, tripletSlice: false }
  },

  'Hip-Hop': {
    label: 'Hip-Hop',
    bpmRange: [80, 100],
    defaultBPM: 90,
    structure: [
      { name: 'intro',   bars: [8, 8],   effects: [] },
      { name: 'verse',   bars: [16, 16], effects: ['full_vocals', 'dense'] },
      { name: 'chorus',  bars: [8, 8],   effects: ['full_vocals', 'ad_libs'] },
      { name: 'verse',   bars: [16, 16], effects: ['full_vocals', 'dense'] },
      { name: 'bridge',  bars: [8, 8],   effects: ['full_vocals'] },
      { name: 'outro',   bars: [8, 8],   effects: [] }
    ],
    choppedSections: [],
    effects: { stutter: false, reverb: false, pitchShift: false, autoTune: false, harmony: false, tripletSlice: false }
  },

  Pop: {
    label: 'Pop',
    bpmRange: [100, 130],
    defaultBPM: 115,
    structure: [
      { name: 'intro',      bars: [4, 8],   effects: [] },
      { name: 'verse',      bars: [8, 16],  effects: ['full_vocals'] },
      { name: 'pre-chorus', bars: [4, 8],   effects: ['full_vocals'] },
      { name: 'chorus',     bars: [8, 8],   effects: ['full_vocals', 'harmony'] },
      { name: 'verse',      bars: [8, 16],  effects: ['full_vocals'] },
      { name: 'pre-chorus', bars: [4, 8],   effects: ['full_vocals'] },
      { name: 'chorus',     bars: [8, 8],   effects: ['full_vocals', 'harmony'] },
      { name: 'bridge',     bars: [8, 8],   effects: ['full_vocals'] },
      { name: 'outro',      bars: [4, 8],   effects: ['fade'] }
    ],
    choppedSections: [],
    effects: { stutter: false, reverb: false, pitchShift: true, autoTune: false, harmony: true, tripletSlice: false }
  },

  Trap: {
    label: 'Trap',
    bpmRange: [130, 160],
    defaultBPM: 140,
    halfTime: true,
    structure: [
      { name: 'intro',      bars: [8, 16],  effects: ['reverb'] },
      { name: 'verse',      bars: [8, 16],  effects: ['full_vocals', 'triplet', 'dense'] },
      { name: 'pre-chorus', bars: [4, 4],   effects: ['full_vocals'] },
      { name: 'chorus',     bars: [8, 8],   effects: ['chopped', 'auto_tune'] },
      { name: 'drop',       bars: [16, 16], effects: ['chopped', 'auto_tune', 'stutter'] },
      { name: 'bridge',     bars: [8, 8],   effects: ['full_vocals'] },
      { name: 'outro',      bars: [8, 8],   effects: ['reverb'] }
    ],
    choppedSections: ['chorus', 'drop'],
    effects: { stutter: true, reverb: true, pitchShift: true, autoTune: true, harmony: false, tripletSlice: true }
  },

  House: {
    label: 'House',
    bpmRange: [120, 128],
    defaultBPM: 124,
    structure: [
      { name: 'intro',      bars: [16, 32], effects: ['chopped', 'minimal_vocals'] },
      { name: 'verse',      bars: [8, 8],   effects: ['full_vocals'] },
      { name: 'chorus',     bars: [16, 16], effects: ['full_vocals'] },
      { name: 'breakdown',  bars: [16, 16], effects: ['chopped'] },
      { name: 'chorus',     bars: [16, 16], effects: ['full_vocals'] },
      { name: 'outro',      bars: [16, 32], effects: ['chopped', 'fade'] }
    ],
    choppedSections: ['intro', 'breakdown', 'outro'],
    effects: { stutter: false, reverb: true, pitchShift: false, autoTune: false, harmony: false, tripletSlice: false }
  },

  Techno: {
    label: 'Techno',
    bpmRange: [120, 140],
    defaultBPM: 130,
    structure: [
      { name: 'intro',      bars: [16, 16], effects: ['minimal_vocals'] },
      { name: 'build',      bars: [32, 64], effects: ['loop_slice', 'reverb'] },
      { name: 'breakdown',  bars: [16, 16], effects: ['minimal_vocals', 'reverb'] },
      { name: 'build',      bars: [32, 64], effects: ['loop_slice'] },
      { name: 'outro',      bars: [16, 16], effects: ['reverb', 'fade'] }
    ],
    choppedSections: ['build'],
    effects: { stutter: false, reverb: true, pitchShift: false, autoTune: false, harmony: false, tripletSlice: false }
  }
};

/**
 * Compute the bar duration in seconds at a given BPM (4/4 time).
 */
export function barDuration(bpm) {
  return (4 * 60) / bpm;
}

/**
 * Map a section array from the LLM (time ranges → section names)
 * and a genre template to produce a final ordered section plan.
 * Returns array of { section, startTime, endTime, effects }
 */
export function buildSectionPlan(sectionMap, genre, bpm, audioDuration) {
  const template = GENRE_TEMPLATES[genre];
  if (!template) throw new Error(`Unknown genre: ${genre}`);

  const barDur = barDuration(bpm);
  const plan = [];
  let cursor = 0;

  for (const tmpl of template.structure) {
    const [minBars, maxBars] = tmpl.bars;
    // Find source material for this section from the LLM map
    const sourceSection = findSourceSection(sectionMap, tmpl.name);
    const sourceDuration = sourceSection
      ? sourceSection.endTime - sourceSection.startTime
      : null;

    // Choose bar count based on available source material
    const targetBars = chooseBars(sourceDuration, barDur, minBars, maxBars);
    const targetDuration = targetBars * barDur;

    plan.push({
      section: tmpl.name,
      sourceStart: sourceSection?.startTime ?? 0,
      sourceEnd: sourceSection?.endTime ?? Math.min(targetDuration, audioDuration),
      targetStart: cursor,
      targetEnd: cursor + targetDuration,
      effects: tmpl.effects,
      chopped: template.choppedSections.includes(tmpl.name)
    });

    cursor += targetDuration;
  }

  return plan;
}

function findSourceSection(sectionMap, sectionName) {
  // sectionMap: { "0s-12s": "verse", "12s-20s": "chorus", ... }
  for (const [range, name] of Object.entries(sectionMap)) {
    if (name.toLowerCase().includes(sectionName.toLowerCase())) {
      const match = range.match(/^(\d+(?:\.\d+)?)s?-(\d+(?:\.\d+)?)s?$/);
      if (match) {
        return { startTime: parseFloat(match[1]), endTime: parseFloat(match[2]) };
      }
    }
  }
  return null;
}

function chooseBars(sourceDuration, barDur, minBars, maxBars) {
  if (sourceDuration === null) return minBars;
  const sourceBars = Math.round(sourceDuration / barDur);
  return Math.min(maxBars, Math.max(minBars, sourceBars));
}
