/**
 * OpenRouter API client — used for text-only LLM tasks:
 *   1. Structural section analysis (transcript → JSON section map)
 *   2. Lyrical coherence check (reordered lyrics → coherence score)
 *
 * Audio never leaves the browser. Only plain text is sent to the API.
 */

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const MODEL = 'openai/gpt-4o-mini'; // fast + cheap; swap to claude-haiku etc. anytime

function getApiKey() {
  // Baked in at build time via Vite — never stored in source code
  return import.meta.env.VITE_OPENROUTER_API_KEY ?? '';
}

async function chatComplete(messages, maxTokens = 400) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('VITE_OPENROUTER_API_KEY is not set');

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://brockdelfante.github.io/Vocal-Aligner/',
      'X-Title': 'Vocal Restructurer'
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Analyse the song structure from a transcript with timestamps.
 * Returns a section map like { "0s-12s": "verse", "12s-24s": "chorus" }
 */
export async function analyseStructure(transcript, genre, bpm) {
  const prompt = `You are a music producer analysing a vocal performance for ${genre} at ${bpm} BPM.

Given this transcript with word timestamps:
${transcript}

Identify the song sections (intro, verse, pre-chorus, chorus, bridge, outro, drop, breakdown).
Return ONLY a JSON object mapping time ranges to section names. Example:
{"0s-8s":"intro","8s-24s":"verse","24s-32s":"chorus"}

Rules:
- Cover the full duration with no gaps and no overlaps
- Use only: intro, verse, pre-chorus, chorus, bridge, outro, drop, breakdown
- Output valid JSON only — no explanation, no markdown`;

  const raw = await chatComplete([{ role: 'user', content: prompt }], 300);

  // Extract JSON from response
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in OpenRouter response');

  const { parseSectionJSON } = await import('./coherenceChecker.js');
  return parseSectionJSON(match[0]);
}

/**
 * Check whether a reordered transcript makes lyrical sense.
 * Returns { coherent, issues, suggestion }
 */
export async function checkCoherenceWithLLM(reorderedTranscript, genre) {
  const prompt = `You are reviewing a reordered vocal track for ${genre}.

Reordered lyrics:
${reorderedTranscript}

Does this arrangement make lyrical and narrative sense?
Reply with JSON only: {"coherent": true/false, "issues": ["issue1"], "suggestion": "..."}`;

  const raw = await chatComplete([{ role: 'user', content: prompt }], 200);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { coherent: true, issues: [], suggestion: '' };

  try {
    return JSON.parse(match[0]);
  } catch {
    return { coherent: true, issues: [], suggestion: '' };
  }
}

export const isApiKeyAvailable = () => Boolean(getApiKey());
