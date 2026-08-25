/**
 * Ranks how closely an event matches a search query — lower number = closer
 * match, so results can be sorted "gần đến xa" (near-to-far): tightest text
 * match first, and only once distance-to-today decides ties. Tiers, best to
 * worst:
 *   0-3  title matches (exact / prefix / word-start / substring)
 *   4-7  location or description matches, same shape
 *   8+   typo-tolerant fallback when nothing substring-matched — the exact
 *        tier is `8 + editDistance` (title) or `12 + editDistance` (location
 *        / description), so a closer typo still outranks a sloppier one.
 */

const WORD_SPLIT_RE = /[^\p{L}\p{N}]+/u;

export interface SearchableEvent {
  readonly title: string;
  readonly location?: string;
  readonly description?: string;
}

export function matchScore(event: SearchableEvent, queryLower: string): number | null {
  if (!queryLower) return null;

  const title = event.title.toLowerCase();
  const titleTier = fieldTier(title, queryLower);
  if (titleTier !== null) return titleTier;

  const secondaryFields = [event.location, event.description]
    .filter((v): v is string => !!v)
    .map((v) => v.toLowerCase());
  for (const field of secondaryFields) {
    const tier = fieldTier(field, queryLower);
    if (tier !== null) return tier + 4;
  }

  // Fuzzy fallback only kicks in for queries long enough that a 1-3 char
  // edit distance is meaningful rather than matching almost anything.
  if (queryLower.length < 3) return null;

  const titleFuzzy = fuzzyWordDistance(title, queryLower);
  if (titleFuzzy !== null) return 8 + titleFuzzy;

  for (const field of secondaryFields) {
    const fuzzy = fuzzyWordDistance(field, queryLower);
    if (fuzzy !== null) return 12 + fuzzy;
  }

  return null;
}

function fieldTier(fieldLower: string, queryLower: string): number | null {
  if (fieldLower === queryLower) return 0;
  if (fieldLower.startsWith(queryLower)) return 1;
  if (fieldLower.split(WORD_SPLIT_RE).some((w) => w.startsWith(queryLower))) return 2;
  if (fieldLower.includes(queryLower)) return 3;
  return null;
}

function fuzzyWordDistance(fieldLower: string, queryLower: string): number | null {
  const threshold = fuzzyThreshold(queryLower.length);
  let best: number | null = null;
  for (const word of fieldLower.split(WORD_SPLIT_RE)) {
    if (!word) continue;
    // Skip words whose length alone already exceeds the threshold — cheap
    // guard against running full DP over an entire long description.
    if (Math.abs(word.length - queryLower.length) > threshold) continue;
    const d = levenshteinDistance(word, queryLower);
    if (d <= threshold && (best === null || d < best)) best = d;
  }
  return best;
}

function fuzzyThreshold(queryLength: number): number {
  if (queryLength <= 5) return 1;
  if (queryLength <= 9) return 2;
  return 3;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = temp;
    }
  }
  return dp[n];
}
