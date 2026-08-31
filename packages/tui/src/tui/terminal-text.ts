const ansiEscape = String.fromCharCode(0x1b);
const bell = String.fromCharCode(0x07);

// 8-bit (C1) equivalents of the 7-bit escape introducers. Terminals honour
// these just like their `ESC`-prefixed counterparts, so they have to be
// recognized as well.
const csiIntroducer8Bit = String.fromCharCode(0x9b);
const oscIntroducer8Bit = String.fromCharCode(0x9d);
const stringTerminator8Bit = String.fromCharCode(0x9c);
const stringIntroducers8Bit =
  String.fromCharCode(0x90) + // DCS
  String.fromCharCode(0x98) + // SOS
  String.fromCharCode(0x9e) + // PM
  String.fromCharCode(0x9f); // APC

// A string sequence ends at BEL, `ESC \` or the 8-bit string terminator.
const stringTerminator = `(?:${bell}|${ansiEscape}\\\\|${stringTerminator8Bit})`;

// CSI sequences, e.g. `ESC [ 1 m` or `ESC [ 6 n`. The final byte is optional so
// that a truncated sequence at the end of the input is still consumed.
const csiSequence = `(?:${ansiEscape}\\[|${csiIntroducer8Bit})[0-?]*[ -/]*[@-~]?`;

// OSC sequences, e.g. `ESC ] 52 ; c ; <base64> BEL` (clipboard write) or
// `ESC ] 8 ; ; <url> BEL` (hyperlink). The payload cannot contain `ESC` or BEL,
// so an unterminated sequence is consumed up to the next escape.
const oscSequence = `(?:${ansiEscape}\\]|${oscIntroducer8Bit})[^${bell}${ansiEscape}${stringTerminator8Bit}]*${stringTerminator}?`;

// DCS, SOS, PM and APC sequences, e.g. `ESC P tmux ; ... ESC \`.
const stringSequence = `(?:${ansiEscape}[PX^_]|[${stringIntroducers8Bit}])[^${ansiEscape}${stringTerminator8Bit}]*(?:${ansiEscape}\\\\|${stringTerminator8Bit})?`;

// Remaining escapes such as `ESC c` (full reset), `ESC 7` (save cursor) or
// `ESC ( 0` (charset selection), plus a trailing lone `ESC`.
const otherEscapeSequence = `${ansiEscape}[ -/]*[0-~]?`;

// Ordered alternation: the introducer-specific rules have to be tried before
// the catch-all escape rule.
const escapeSequence = [
  csiSequence,
  oscSequence,
  stringSequence,
  otherEscapeSequence,
].join('|');

// C0 control characters (except tab and newline), DEL and the C1 range. These
// can reposition the cursor (CR, BS), ring the bell or terminate sequences.
const controlCharacter = '[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f]';

export const ansiPattern = new RegExp(escapeSequence, 'g');
export const ansiPrefixPattern = new RegExp(`^(?:${escapeSequence})`);

// The only escape sequences the terminal UI emits inside content are SGR
// (colors and text styles). Everything else is dropped before it is written.
const sgrPrefixPattern = new RegExp(`^${ansiEscape}\\[[0-9;:]*m`);
const controlCharacterPattern = new RegExp(controlCharacter, 'g');

export function stripAnsi(input: string): string {
  return input.replace(ansiPattern, '');
}

/**
 * Removes every terminal escape sequence and control character from untrusted
 * text (model output, tool results, error messages, pasted input).
 *
 * Writing such text to a terminal verbatim lets it drive the terminal instead
 * of just being displayed: OSC 52 writes the user's clipboard, OSC 8 hides a
 * different target behind link text, OSC 0/2 rewrites the window title,
 * DCS/APC passthrough reaches the multiplexer, and CSI can move the cursor to
 * rewrite already-rendered output or ask the terminal to report state back on
 * stdin.
 *
 * Newlines and tabs are preserved; use {@link sanitizeTerminalLine} for text
 * that is rendered on a single line.
 */
export function sanitizeTerminalText(input: string): string {
  return input.replace(ansiPattern, '').replace(controlCharacterPattern, '');
}

/**
 * Sanitizes untrusted text that is rendered on a single line, e.g. a section
 * title, the status line or the prompt input. Newlines are replaced with
 * spaces so the text cannot break out of its line and shift the frame.
 */
export function sanitizeTerminalLine(input: string): string {
  return sanitizeTerminalText(input).replace(/\n/g, ' ');
}

export function visibleLength(input: string): number {
  let width = 0;
  let index = 0;

  while (index < input.length) {
    const ansiMatch = input.slice(index).match(ansiPrefixPattern);

    if (ansiMatch) {
      index += ansiMatch[0].length;
      continue;
    }

    const codePoint = input.codePointAt(index);

    if (codePoint == null) {
      break;
    }

    const character = String.fromCodePoint(codePoint);
    width += codePointWidth(codePoint);
    index += character.length;
  }

  return width;
}

export function sliceVisible(input: string, width: number): string {
  if (width <= 0) {
    return '';
  }

  let output = '';
  let visible = 0;
  let index = 0;

  while (index < input.length && visible < width) {
    const ansiMatch = input.slice(index).match(ansiPrefixPattern);

    if (ansiMatch) {
      output += keptEscapeSequence(ansiMatch[0]);
      index += ansiMatch[0].length;
      continue;
    }

    const codePoint = input.codePointAt(index);

    if (codePoint == null) {
      break;
    }

    const character = String.fromCodePoint(codePoint);

    if (isControlCodePoint(codePoint)) {
      index += character.length;
      continue;
    }

    const characterWidth = codePointWidth(codePoint);

    if (characterWidth > 0 && visible + characterWidth > width) {
      break;
    }

    output += character;
    index += character.length;
    visible += characterWidth;
  }

  while (index < input.length) {
    const ansiMatch = input.slice(index).match(ansiPrefixPattern);

    if (!ansiMatch) {
      break;
    }

    output += keptEscapeSequence(ansiMatch[0]);
    index += ansiMatch[0].length;
  }

  return output;
}

/**
 * Drops escape sequences that are not styling. `sliceVisible` runs on every
 * line right before it is written to the terminal, so this is the last barrier
 * against a sequence that was not sanitized at its source.
 */
function keptEscapeSequence(sequence: string): string {
  return sgrPrefixPattern.test(sequence) ? sequence : '';
}

function isControlCodePoint(codePoint: number): boolean {
  return (
    codePoint !== 0x09 &&
    (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f))
  );
}

export function codePointWidth(codePoint: number): number {
  if (codePoint === 0x09) {
    return 4;
  }

  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) {
    return 0;
  }

  if (isZeroWidthCodePoint(codePoint)) {
    return 0;
  }

  return isWideCodePoint(codePoint) ? 2 : 1;
}

function isZeroWidthCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x0483 && codePoint <= 0x0489) ||
    (codePoint >= 0x0591 && codePoint <= 0x05bd) ||
    codePoint === 0x05bf ||
    (codePoint >= 0x05c1 && codePoint <= 0x05c2) ||
    (codePoint >= 0x05c4 && codePoint <= 0x05c5) ||
    codePoint === 0x05c7 ||
    (codePoint >= 0x0610 && codePoint <= 0x061a) ||
    (codePoint >= 0x064b && codePoint <= 0x065f) ||
    codePoint === 0x0670 ||
    (codePoint >= 0x06d6 && codePoint <= 0x06dc) ||
    (codePoint >= 0x06df && codePoint <= 0x06e4) ||
    (codePoint >= 0x06e7 && codePoint <= 0x06e8) ||
    (codePoint >= 0x06ea && codePoint <= 0x06ed) ||
    codePoint === 0x0711 ||
    (codePoint >= 0x0730 && codePoint <= 0x074a) ||
    (codePoint >= 0x07a6 && codePoint <= 0x07b0) ||
    (codePoint >= 0x07eb && codePoint <= 0x07f3) ||
    (codePoint >= 0x0816 && codePoint <= 0x0819) ||
    (codePoint >= 0x081b && codePoint <= 0x0823) ||
    (codePoint >= 0x0825 && codePoint <= 0x0827) ||
    (codePoint >= 0x0829 && codePoint <= 0x082d) ||
    (codePoint >= 0x0859 && codePoint <= 0x085b) ||
    (codePoint >= 0x08d3 && codePoint <= 0x0902) ||
    codePoint === 0x093a ||
    codePoint === 0x093c ||
    (codePoint >= 0x0941 && codePoint <= 0x0948) ||
    codePoint === 0x094d ||
    (codePoint >= 0x0951 && codePoint <= 0x0957) ||
    codePoint === 0x200d ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
}

function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}
