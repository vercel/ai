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

/**
 * Escape characters that are invisible on their own: Unicode format characters
 * such as bidirectional controls, default ignorable code points such as
 * zero-width characters, variation selectors, and Hangul fillers, and the line
 * and paragraph separators. Some of them change how the surrounding text reads.
 */
export function escapeInvisibleCharacters(input: string): string {
  return input.replace(
    /[\p{Cf}\p{Default_Ignorable_Code_Point}\p{Zl}\p{Zp}]/gu,
    character => `\\u{${character.codePointAt(0)?.toString(16)}}`,
  );
}
