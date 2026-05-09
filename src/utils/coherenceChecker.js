/**
 * Lyrical coherence checker.
 * After restructuring, validates that the reordered transcript
 * still forms a coherent narrative/lyrical flow.
 *
 * In production this calls SmolLM via Transformers.js in a Web Worker.
 * The exported pure functions are fully testable without AI models.
 */

/**
 * Score semantic coherence between two adjacent lyric segments.
 * Uses a basic n-gram overlap heuristic when LLM is unavailable.
 */
export function scoreLyricTransition(segmentA, segmentB) {
  if (!segmentA || !segmentB) return 0.5;

  const wordsA = new Set(tokenize(segmentA));
  const wordsB = new Set(tokenize(segmentB));

  // Jaccard similarity of vocabulary
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  const jaccard = union === 0 ? 0 : intersection / union;

  // Penalise abrupt topic changes (very low overlap)
  // Reward continuity markers ("and", "but", "so", "then", "now")
  const continuityWords = ['and', 'but', 'so', 'then', 'now', 'yeah', 'oh'];
  const hasContinuity = continuityWords.some(w =>
    segmentB.toLowerCase().startsWith(w)
  );

  return Math.min(1, jaccard + (hasContinuity ? 0.1 : 0));
}

/**
 * Check whether a reordered transcript makes lyrical sense.
 * Returns { coherent: boolean, score: number, issues: string[] }
 */
export function checkLyricalCoherence(reorderedSegments) {
  if (!reorderedSegments || reorderedSegments.length === 0) {
    return { coherent: true, score: 1, issues: [] };
  }

  const issues = [];
  let totalScore = 0;

  for (let i = 0; i < reorderedSegments.length - 1; i++) {
    const score = scoreLyricTransition(
      reorderedSegments[i].text,
      reorderedSegments[i + 1].text
    );
    totalScore += score;

    if (score < 0.05) {
      issues.push(
        `Abrupt transition between section ${i + 1} and ${i + 2}: ` +
        `"${reorderedSegments[i].section}" → "${reorderedSegments[i + 1].section}"`
      );
    }
  }

  const avgScore = reorderedSegments.length > 1
    ? totalScore / (reorderedSegments.length - 1)
    : 1;

  return {
    coherent: issues.length === 0,
    score: parseFloat(avgScore.toFixed(2)),
    issues
  };
}

/**
 * Try alternative arrangements if the first arrangement is incoherent.
 * Returns the arrangement with the best coherence score.
 */
export function findBestArrangement(sectionPlan, transcriptSegments, maxAttempts = 3) {
  const arrangements = [sectionPlan];

  // Generate simple alternatives by rotating non-critical sections
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    const alt = [...sectionPlan];
    // Swap verse sections to try different lyric ordering
    const verseIndices = alt
      .map((s, i) => (s.section === 'verse' ? i : -1))
      .filter(i => i !== -1);

    if (verseIndices.length >= 2) {
      const [a, b] = verseIndices;
      [alt[a], alt[b]] = [alt[b], alt[a]];
      arrangements.push(alt);
    }
  }

  let bestScore = -1;
  let bestArrangement = sectionPlan;

  for (const arrangement of arrangements) {
    const segments = arrangement.map(s => {
      const seg = transcriptSegments.find(t =>
        t.start >= s.sourceStart - 0.5 && t.end <= s.sourceEnd + 0.5
      );
      return { section: s.section, text: seg?.text ?? '' };
    });

    const { score } = checkLyricalCoherence(segments);
    if (score > bestScore) {
      bestScore = score;
      bestArrangement = arrangement;
    }
  }

  return { arrangement: bestArrangement, score: bestScore };
}

/**
 * Parse the LLM JSON output for section mapping.
 * Input: string like '{"0s-12s":"verse","12s-20s":"chorus"}'
 * Returns plain object or throws on invalid JSON.
 */
export function parseSectionJSON(raw) {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate expected format
  for (const [key, value] of Object.entries(parsed)) {
    if (!/^\d+(?:\.\d+)?s?-\d+(?:\.\d+)?s?$/.test(key)) {
      throw new Error(`Invalid time range key: ${key}`);
    }
    if (typeof value !== 'string') {
      throw new Error(`Section name must be a string, got: ${typeof value}`);
    }
  }

  return parsed;
}

/**
 * Build the SmolLM prompt for structural analysis.
 */
export function buildStructurePrompt(transcript, genre, bpm) {
  return `You are a music producer analyzing a vocal performance for ${genre} production at ${bpm} BPM.

Given this transcript with timestamps:
${transcript}

Identify the song sections (intro, verse, pre-chorus, chorus, bridge, outro, drop, breakdown).
Return ONLY a JSON object mapping time ranges to section names. Example:
{"0s-8s":"intro","8s-24s":"verse","24s-32s":"chorus"}

Rules:
- Cover the full duration
- No overlapping ranges
- Use only these sections: intro, verse, pre-chorus, chorus, bridge, outro, drop, breakdown
- Output valid JSON only, no explanation`;
}

/**
 * Build the SmolLM prompt for lyrical coherence check.
 */
export function buildCoherencePrompt(reorderedTranscript, genre) {
  return `You are reviewing a reordered vocal track for ${genre}.

Reordered lyrics:
${reorderedTranscript}

Does this arrangement make lyrical and narrative sense?
Reply with JSON: {"coherent": true/false, "issues": ["issue1", ...], "suggestion": "..."}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
  'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy'
]);
