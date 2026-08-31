const ansiEscape = String.fromCharCode(27);
const bell = String.fromCharCode(7);
const stringTerminator = `${ansiEscape}\\\\`;

// CSI sequences: ESC [ parameter bytes intermediate bytes final byte.
const csiSequence = `${ansiEscape}\\[[0-?]*[ -/]*[@-~]`;

// OSC sequences: ESC ] command, terminated by BEL or ST. Includes unterminated
// sequences so that partial sequences in streamed text are never forwarded.
const oscSequence = `${ansiEscape}\\][^${bell}${ansiEscape}]*(?:${bell}|${stringTerminator})?`;

// DCS, SOS, PM and APC sequences: ESC P|X|^|_ command, terminated by ST.
const stringSequence = `${ansiEscape}[PX^_][^${ansiEscape}]*(?:${stringTerminator})?`;

// A CSI sequence that is still incomplete at the end of the input.
const partialCsiSequence = `${ansiEscape}\\[[0-?]*[ -/]*$`;

// Remaining escape sequences (e.g. `ESC c`, `ESC ( B`) and a lone escape byte.
const otherEscapeSequence = `${ansiEscape}[ -/]*[0-~]?`;

// SGR sequences only change text attributes, so they are safe to keep when text
// that the terminal UI styled itself is measured and sliced.
const sgrSequence = `${ansiEscape}\\[[0-9;:]*m`;

const escapeSequence = [
  csiSequence,
  oscSequence,
  stringSequence,
  partialCsiSequence,
  otherEscapeSequence,
].join('|');

export const escapeSequencePattern = new RegExp(escapeSequence, 'g');
export const escapeSequencePrefixPattern = new RegExp(`^(?:${escapeSequence})`);

const safeEscapeSequencePattern = new RegExp(`^(?:${sgrSequence})$`);

// Every C0 and C1 control character except the newline that separates the lines
// of a rendered frame. Removing the C1 range also removes the 8-bit introducers
// for CSI, OSC and DCS sequences.
const controlCharacterPattern = /(?!\n)\p{Cc}/gu;

const tabWidth = 4;
const tabPattern = /\t/g;
const tabIndent = ' '.repeat(tabWidth);

export function stripAnsi(input: string): string {
  return input.replace(escapeSequencePattern, '');
}

/**
 * Removes terminal escape sequences and control characters from text that the
 * terminal UI did not generate itself, such as model output, tool results and
 * pasted input.
 *
 * Terminals act on escape sequences that are embedded in the text they print:
 * OSC sequences can write the system clipboard or change the window title, DCS
 * sequences can redefine keys or tunnel sequences through a multiplexer, and CSI
 * sequences can move the cursor outside of the box the text is rendered in.
 * Untrusted text is therefore reduced to printable characters and newlines
 * before it is laid out, and the terminal UI adds its own styling afterwards.
 *
 * Incomplete sequences are removed as well, so that a sequence that is split
 * across streamed chunks is never forwarded to the terminal.
 */
export function sanitizeTerminalText(input: string): string {
  return input
    .replace(escapeSequencePattern, '')
    .replace(tabPattern, tabIndent)
    .replace(controlCharacterPattern, '');
}

/**
 * Sanitizes untrusted text that is rendered on a single line, such as a title,
 * a status message or the prompt input.
 */
export function sanitizeTerminalLine(input: string): string {
  return sanitizeTerminalText(input).replace(/\n/g, ' ');
}

export function visibleLength(input: string): number {
  let width = 0;
  let index = 0;

  while (index < input.length) {
    const ansiMatch = input.slice(index).match(escapeSequencePrefixPattern);

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
    const ansiMatch = input.slice(index).match(escapeSequencePrefixPattern);

    if (ansiMatch) {
      output += keepSafeEscapeSequence(ansiMatch[0]);
      index += ansiMatch[0].length;
      continue;
    }

    const codePoint = input.codePointAt(index);

    if (codePoint == null) {
      break;
    }

    const character = String.fromCodePoint(codePoint);
    const characterWidth = codePointWidth(codePoint);

    if (characterWidth > 0 && visible + characterWidth > width) {
      break;
    }

    output += character;
    index += character.length;
    visible += characterWidth;
  }

  while (index < input.length) {
    const ansiMatch = input.slice(index).match(escapeSequencePrefixPattern);

    if (!ansiMatch) {
      break;
    }

    output += keepSafeEscapeSequence(ansiMatch[0]);
    index += ansiMatch[0].length;
  }

  return output;
}

function keepSafeEscapeSequence(sequence: string): string {
  return safeEscapeSequencePattern.test(sequence) ? sequence : '';
}

export function codePointWidth(codePoint: number): number {
  if (codePoint === 0x09) {
    return tabWidth;
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
