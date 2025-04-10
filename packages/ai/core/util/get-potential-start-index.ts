/**
 * Returns the index of the start of the searchedText in the text, or null if it
 * is not found.
 */
export function getPotentialStartIndex(
  text: string,
  searchedText: string,
): number | null {
  // Return null immediately if searchedText is empty.
  if (searchedText.length === 0) {
    return null;
  }

  // Check if the searchedText exists as a direct substring of text.
  const directIndex = text.indexOf(searchedText);
  if (directIndex !== -1) {
    return directIndex;
  }

  // Otherwise, look for the largest suffix of "text" that matches
  // a prefix of "searchedText". We go from the beginning of text.
  for (let i = 0; i < text.length; i++) {
    const suffix = text.substring(i);
    if (searchedText.startsWith(suffix)) {
      // This is the starting index of the longest suffix of 'text'
      // that is also a prefix of 'searchedText'.
      return i;
    }
  }

  return null;
}
