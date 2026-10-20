/**
 * Escape untrusted terminal controls before adding any TUI-owned ANSI styles.
 * Escaping each control character also makes incomplete sequences and sequences
 * split across stream chunks safe, without maintaining terminal parser state.
 */
export function sanitizeTerminalText(
  input: string,
  { multiline = false }: { multiline?: boolean } = {},
): string {
  let output = '';

  for (const character of input) {
    const code = character.charCodeAt(0);

    if (character === '\n' && multiline) {
      output += '\n';
    } else if (character === '\t') {
      output += '    ';
    } else if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      output += `\\u${code.toString(16).padStart(4, '0')}`;
    } else {
      output += character;
    }
  }

  return output;
}
