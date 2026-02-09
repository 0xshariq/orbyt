/**
 * Typo Detection Utility
 * 
 * Provides string similarity matching for suggesting corrections
 * when unknown fields are encountered in workflow definitions.
 * 
 * @module errors
 */

/**
 * Calculate Levenshtein distance between two strings
 * (minimum number of single-character edits needed to change one string into another)
 * 
 * @param a - First string
 * @param b - Second string
 * @returns Edit distance
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1, higher is more similar)
 * 
 * @param a - First string
 * @param b - Second string
 * @returns Similarity score (0 = completely different, 1 = identical)
 */
function similarityScore(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - distance / maxLength;
}

/**
 * Find the best match for a string from a list of candidates
 * 
 * @param input - Input string (potentially misspelled)
 * @param candidates - List of valid strings to match against
 * @param threshold - Minimum similarity score to consider (default: 0.6)
 * @returns Best matching candidate or undefined if no good match found
 */
export function findClosestMatch(
  input: string,
  candidates: string[],
  threshold: number = 0.6
): string | undefined {
  let bestMatch: string | undefined;
  let bestScore = threshold;

  for (const candidate of candidates) {
    const score = similarityScore(input, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Find multiple potential matches (returns top N)
 * 
 * @param input - Input string (potentially misspelled)
 * @param candidates - List of valid strings to match against
 * @param maxResults - Maximum number of results to return
 * @param threshold - Minimum similarity score to consider
 * @returns Array of matches sorted by similarity (best first)
 */
export function findMatches(
  input: string,
  candidates: string[],
  maxResults: number = 3,
  threshold: number = 0.5
): string[] {
  const matches: Array<{ candidate: string; score: number }> = [];

  for (const candidate of candidates) {
    const score = similarityScore(input, candidate);
    if (score >= threshold) {
      matches.push({ candidate, score });
    }
  }

  // Sort by score (descending) and return top N candidates
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(m => m.candidate);
}

/**
 * Check if a string is a likely typo of another (quick check)
 * 
 * @param input - Input string
 * @param target - Target string to check against
 * @returns True if likely a typo of target
 */
export function isLikelyTypo(input: string, target: string): boolean {
  return similarityScore(input, target) >= 0.7;
}
