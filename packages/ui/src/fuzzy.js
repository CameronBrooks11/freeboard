/**
 * @module fuzzy
 * @description Utility functions for fuzzy string matching.
 */

/**
 * Compute the Levenshtein distance between two strings.
 *
 * @param {string} str1 - First string.
 * @param {string} str2 - Second string.
 * @returns {number} The number of edits required to transform str1 into str2.
 */
export function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;

  // Initialize the DP matrix with dimensions (len1+1) x (len2+1)
  let matrix = Array(len1 + 1);
  for (let i = 0; i <= len1; i++) {
    matrix[i] = Array(len2 + 1);
  }

  // Base cases: transforming empty string to prefix of other string
  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }
  
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Populate matrix with minimum edit operations
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        // Compute minimum of deletion, insertion, and substitution
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }

  return matrix[len1][len2];
}
