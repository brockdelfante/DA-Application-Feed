/**
 * Beat-aware vocal quantizer and section restructurer.
 *
 * Step 1 — Word detection: find word/phrase boundaries via silence detection
 * Step 2 — Beat snap: move each word to the nearest 1/16th note (no stretching)
 * Step 3 — Section detection: group words into sections by energy/silence gaps
 * Step 4 — Genre restructure: reorder sections to match the target genre template
 */

import { snapToSixteenth } from './bpmDetection.js';
import { GENRE_TEMPLATES, barDuration } from './genreTemplates.js';

const CROSSFADE_SAMPLES = 2205; // 50ms at 44100 Hz

// ─── Word / Phrase boundary detection ───────────────────────────────────────

/**
 * Detect word chunks by finding runs of audio above an energy threshold.
 * Returns array of { start, end } in seconds.
 */
export function detectWordChunks(audioData, sampleRate, opts = {}) {
  const {
    thresholdRMS = 0.015,
    minSilenceSec = 0.05,
    minWordSec = 0.04,
    preRoll = 0.01   // seconds to include before onset (eslint: _minWordFrames used below)
  } = opts;

  const frameSec = 0.005; // 5ms analysis frames
  const frameSize = Math.floor(sampleRate * frameSec);
  const minSilenceFrames = Math.ceil(minSilenceSec / frameSec);
  void Math.ceil(minWordSec / frameSec); // minWordSec reserved for future filtering

  // Compute RMS per frame
  const frames = [];
  for (let i = 0; i + frameSize < audioData.length; i += frameSize) {
    let sum = 0;
    for (let j = 0; j < frameSize; j++) sum += audioData[i + j] ** 2;
    frames.push(Math.sqrt(sum / frameSize));
  }

  const chunks = [];
  let inWord = false;
  let wordStart = 0;
  let silenceCount = 0;

  for (let f = 0; f < frames.length; f++) {
    const t = f * frameSec;
    if (frames[f] > thresholdRMS) {
      if (!inWord) {
        wordStart = Math.max(0, t - preRoll);
        inWord = true;
      }
      silenceCount = 0;
    } else {
      if (inWord) {
        silenceCount++;
        if (silenceCount >= minSilenceFrames) {
          const wordEnd = t;
          if (wordEnd - wordStart > minWordSec) {
            chunks.push({ start: wordStart, end: wordEnd });
          }
          inWord = false;
          silenceCount = 0;
        }
      }
    }
  }

  // Close last word if audio ends while voiced
  if (inWord) {
    const wordEnd = audioData.length / sampleRate;
    chunks.push({ start: wordStart, end: wordEnd });
  }

  return chunks;
}

// ─── Beat snapping (no time-stretch) ────────────────────────────────────────

/**
 * Snap each word chunk's START to the nearest 1/16th note.
 * Returns array of { sourceStart, sourceEnd, targetStart, targetEnd }
 */
export function snapChunksToBeatGrid(chunks, bpm) {
  const snapped = [];

  for (const chunk of chunks) {
    const duration = chunk.end - chunk.start;
    const targetStart = snapToSixteenth(chunk.start, bpm);
    snapped.push({
      sourceStart: chunk.start,
      sourceEnd: chunk.end,
      targetStart,
      targetEnd: targetStart + duration
    });
  }

  return snapped;
}

/**
 * Render beat-snapped chunks into a new audio buffer.
 * Gaps between chunks are filled with silence.
 * Overlapping chunks are mixed together.
 */
export function renderSnappedAudio(audioData, sampleRate, snappedChunks) {
  if (snappedChunks.length === 0) return audioData.slice();

  // Determine output length
  const lastEnd = Math.max(...snappedChunks.map(c => c.targetEnd));
  const outputSamples = Math.ceil(lastEnd * sampleRate);
  const output = new Float32Array(outputSamples);

  for (const chunk of snappedChunks) {
    const srcStart = Math.floor(chunk.sourceStart * sampleRate);
    const srcEnd = Math.min(Math.floor(chunk.sourceEnd * sampleRate), audioData.length);
    const dstStart = Math.floor(chunk.targetStart * sampleRate);

    const copyLen = srcEnd - srcStart;
    const fadeLen = Math.min(CROSSFADE_SAMPLES, Math.floor(copyLen / 4));

    for (let i = 0; i < copyLen; i++) {
      const dstIdx = dstStart + i;
      if (dstIdx >= output.length) break;

      let sample = audioData[srcStart + i];

      // Fade in / fade out for clean transitions
      if (i < fadeLen) sample *= i / fadeLen;
      if (i >= copyLen - fadeLen) sample *= (copyLen - i) / fadeLen;

      output[dstIdx] += sample;
    }
  }

  return output;
}

// ─── Section detection ────────────────────────────────────────────────────────

/**
 * Group word chunks into sections based on silence gaps.
 * A new section starts when there is a gap > gapThresholdSec between chunks.
 * Returns array of { start, end, chunks }
 */
export function detectSections(chunks, gapThresholdSec = 1.5) {
  if (chunks.length === 0) return [];

  const sections = [];
  let currentSection = { start: chunks[0].start, end: chunks[0].end, chunks: [chunks[0]] };

  for (let i = 1; i < chunks.length; i++) {
    const gap = chunks[i].start - chunks[i - 1].end;
    if (gap > gapThresholdSec) {
      sections.push(currentSection);
      currentSection = { start: chunks[i].start, end: chunks[i].end, chunks: [chunks[i]] };
    } else {
      currentSection.end = chunks[i].end;
      currentSection.chunks.push(chunks[i]);
    }
  }
  sections.push(currentSection);

  return sections;
}

/**
 * Assign section labels (intro/verse/chorus/etc.) to detected sections
 * using energy analysis — louder sections tend to be choruses.
 */
export function labelSections(sections, audioData, sampleRate, genre) {
  const template = GENRE_TEMPLATES[genre];
  if (!template) return sections.map((s, i) => ({ ...s, label: 'section_' + i }));

  // Compute average energy per section
  const energies = sections.map(sec => {
    const start = Math.floor(sec.start * sampleRate);
    const end = Math.min(Math.floor(sec.end * sampleRate), audioData.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += audioData[i] ** 2;
    return Math.sqrt(sum / Math.max(1, end - start));
  });

  // Sort by energy descending to assign labels
  const sortedIdx = energies
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e - a.e)
    .map(x => x.i);

  const labeled = [...sections];
  const midpoint = Math.floor(sortedIdx.length / 2);

  sortedIdx.forEach((secIdx, rank) => {
    // Higher energy → chorus/drop; lower → intro/outro/verse
    if (rank < midpoint * 0.3) {
      labeled[secIdx] = { ...labeled[secIdx], label: 'chorus' };
    } else if (rank < midpoint * 0.6) {
      labeled[secIdx] = { ...labeled[secIdx], label: 'verse' };
    } else if (secIdx === 0) {
      labeled[secIdx] = { ...labeled[secIdx], label: 'intro' };
    } else if (secIdx === sections.length - 1) {
      labeled[secIdx] = { ...labeled[secIdx], label: 'outro' };
    } else {
      labeled[secIdx] = { ...labeled[secIdx], label: 'bridge' };
    }
  });

  return labeled;
}

// ─── Genre restructuring ─────────────────────────────────────────────────────

/**
 * Reorder labeled sections to match the genre template.
 * Returns a new ordered array of sections.
 * Sections are repeated or dropped as needed to fill the template.
 */
export function restructureToGenre(labeledSections, genre, bpm = 120) {
  const template = GENRE_TEMPLATES[genre];
  if (!template) return labeledSections;

  const barDur = barDuration(bpm);
  const result = [];

  for (const tmplSection of template.structure) {
    const name = tmplSection.name;
    const [minBars] = tmplSection.bars;
    const minDur = minBars * barDur;

    // Find best matching source section
    const match = labeledSections.find(s => s.label === name)
      ?? labeledSections.find(s => s.label === 'verse')   // verse is good filler
      ?? labeledSections[0];

    if (match) {
      result.push({
        ...match,
        targetLabel: name,
        effects: tmplSection.effects,
        chopped: template.choppedSections.includes(name),
        minDuration: minDur
      });
    }
  }

  return result;
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

/**
 * Main processing function — runs entirely in a Web Worker.
 * 1. Detect word chunks
 * 2. Snap to beat grid
 * 3. Detect + label sections
 * 4. Restructure to genre
 * 5. Render final audio
 *
 * Returns { fullMix, stems, sectionPlan }
 */
export function processVocals(audioData, sampleRate, { genre, targetBPM, whisperChunks, onProgress }) {

  onProgress?.({ stage: 'WORDS', pct: 5, message: 'Detecting word boundaries…' });
  // Prefer Whisper timestamps; fall back to energy-based detection
  const wordChunks = (whisperChunks && whisperChunks.length > 0)
    ? whisperChunks
    : detectWordChunks(audioData, sampleRate);

  onProgress?.({ stage: 'SNAP', pct: 20, message: `Snapping ${wordChunks.length} words to beat grid…` });
  const snappedChunks = snapChunksToBeatGrid(wordChunks, targetBPM);

  onProgress?.({ stage: 'BEAT_AUDIO', pct: 35, message: 'Rendering beat-aligned vocals…' });
  const beatAlignedAudio = renderSnappedAudio(audioData, sampleRate, snappedChunks);

  onProgress?.({ stage: 'SECTIONS', pct: 50, message: 'Detecting sections…' });
  const rawSections = detectSections(wordChunks, 1.0);
  const labeledSections = labelSections(rawSections, audioData, sampleRate, genre);

  onProgress?.({ stage: 'RESTRUCTURE', pct: 65, message: `Restructuring ${labeledSections.length} sections for ${genre}…` });
  const restructured = restructureToGenre(labeledSections, genre, targetBPM);

  onProgress?.({ stage: 'RENDER', pct: 80, message: 'Rendering final mix…' });
  const { fullMix, stems, sectionPlan } = renderRestructured(
    beatAlignedAudio, audioData, sampleRate, restructured, targetBPM
  );

  onProgress?.({ stage: 'DONE', pct: 100, message: 'Done.' });

  return { fullMix, stems, sectionPlan };
}

// ─── Render restructured sections ────────────────────────────────────────────

function renderRestructured(beatAlignedAudio, _originalAudio, sampleRate, restructured, _bpm) {
  const stems = [];
  const sectionPlan = [];
  let cursor = 0;

  // Build output as concatenated sections
  const parts = [];

  for (const section of restructured) {
    const srcStart = Math.floor(section.start * sampleRate);
    const srcEnd = Math.min(Math.floor(section.end * sampleRate), beatAlignedAudio.length);

    if (srcStart >= srcEnd) continue;

    const srcAudio = beatAlignedAudio.slice(srcStart, srcEnd);
    const duration = srcAudio.length / sampleRate;

    // Apply fade in/out
    const fadeLen = Math.min(CROSSFADE_SAMPLES, Math.floor(srcAudio.length / 4));
    for (let i = 0; i < fadeLen; i++) srcAudio[i] *= i / fadeLen;
    for (let i = srcAudio.length - fadeLen; i < srcAudio.length; i++) {
      srcAudio[i] *= (srcAudio.length - i) / fadeLen;
    }

    parts.push(srcAudio);
    stems.push({
      section: section.targetLabel ?? section.label,
      audio: srcAudio,
      duration
    });

    sectionPlan.push({
      section: section.targetLabel ?? section.label,
      sourceStart: section.start,
      sourceEnd: section.end,
      targetStart: cursor,
      targetEnd: cursor + duration,
      effects: section.effects ?? [],
      chopped: section.chopped ?? false
    });

    cursor += duration;
  }

  // Concatenate all parts
  const totalSamples = parts.reduce((acc, p) => acc + p.length, 0);
  const fullMix = new Float32Array(totalSamples);
  let offset = 0;
  for (const part of parts) {
    fullMix.set(part, offset);
    offset += part.length;
  }

  return { fullMix, stems, sectionPlan };
}
