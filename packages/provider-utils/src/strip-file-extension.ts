/**
 * Strips file extension segments from a filename.
 *
 * Examples:
 * - "report.pdf" -> "report"
 * - "archive.tar.gz" -> "archive"
 * - "filename" -> "filename"
 * - ".env" -> ".env"
 * - ".hidden.txt" -> ".hidden"
 */
export function stripFileExtension(filename: string): string {
  // Start the search at index 1 so a dotfile's leading dot (".env", ".gitignore")
  // is not treated as an extension separator, which would strip the whole name.
  const firstDotIndex = filename.indexOf('.', 1);

  return firstDotIndex === -1 ? filename : filename.slice(0, firstDotIndex);
}
