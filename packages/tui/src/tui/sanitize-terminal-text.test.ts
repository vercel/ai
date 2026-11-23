import { describe, expect, it } from 'vitest';
import {
  escapeInvisibleCharacters,
  sanitizeTerminalText,
} from './sanitize-terminal-text';

describe('escapeInvisibleCharacters', () => {
  it.each([
    ['bidirectional controls', 'a\u202eb\u2066c', 'a\\u{202e}b\\u{2066}c'],
    [
      'zero-width characters',
      'a\u200bb\u200dc\ufeffd',
      'a\\u{200b}b\\u{200d}c\\u{feff}d',
    ],
    ['tag characters', 'a\u{e0041}b', 'a\\u{e0041}b'],
    ['variation selectors', '☀\ufe0f a\u{e0100}b', '☀\\u{fe0f} a\\u{e0100}b'],
    ['Hangul fillers', 'a\u3164b\u115fc', 'a\\u{3164}b\\u{115f}c'],
    [
      'line and paragraph separators',
      'a\u2028b\u2029c',
      'a\\u{2028}b\\u{2029}c',
    ],
  ])('escapes %s', (_, input, expected) => {
    expect(escapeInvisibleCharacters(input)).toBe(expected);
  });

  it('preserves visible characters, including combining marks', () => {
    expect(escapeInvisibleCharacters('Hello 日本語 한글 😀 e\u0301 नमस्ते')).toBe(
      'Hello 日本語 한글 😀 e\u0301 नमस्ते',
    );
  });
});

describe('sanitizeTerminalText', () => {
  it('preserves printable Unicode and expands tabs to spaces', () => {
    expect(sanitizeTerminalText('Hello\t日本語 😀 e\u0301')).toBe(
      'Hello    日本語 😀 e\u0301',
    );
  });

  it('preserves newlines only in multiline content', () => {
    expect(sanitizeTerminalText('one\ntwo')).toBe('one\\u000atwo');
    expect(sanitizeTerminalText('one\ntwo', { multiline: true })).toBe(
      'one\ntwo',
    );
    expect(sanitizeTerminalText('one\rtwo', { multiline: true })).toBe(
      'one\\u000dtwo',
    );
  });

  it.each([
    ['OSC with BEL', '\x1b]52;c;dGVzdA==\x07'],
    ['OSC with ST', '\x1b]0;title\x1b\\'],
    ['DCS', '\x1bPtest\x1b\\'],
    ['APC', '\x1b_test\x1b\\'],
    ['PM', '\x1b^test\x1b\\'],
    ['SOS', '\x1bXtest\x1b\\'],
    ['C1 controls', '\x90test\x9c\x9dtest\x9c\x9f test\x9c'],
    ['CSI cursor movement', '\x1b[1;1H\x9b2J'],
    ['SGR conceal', '\x1b[8mhidden\x1b[0m'],
    ['terminal reset', '\x1bc'],
    ['unterminated OSC', '\x1b]52;c;'],
    ['trailing escape', 'text\x1b'],
  ])('neutralizes %s regardless of chunk boundaries', (_, input) => {
    const sanitized = sanitizeTerminalText(input);
    for (const character of sanitized) {
      const code = character.charCodeAt(0);
      expect(code >= 0x20 && (code < 0x7f || code > 0x9f)).toBe(true);
    }
    for (let split = 0; split <= input.length; split++) {
      expect(
        sanitizeTerminalText(input.slice(0, split)) +
          sanitizeTerminalText(input.slice(split)),
      ).toBe(sanitized);
    }
  });

  it('escapes all C0, DEL, and C1 controls except tabs', () => {
    for (let code = 0; code <= 0x9f; code++) {
      if (code >= 0x20 && code < 0x7f) {
        continue;
      }
      expect(sanitizeTerminalText(String.fromCharCode(code))).toBe(
        code === 0x09 ? '    ' : `\\u${code.toString(16).padStart(4, '0')}`,
      );
    }
  });
});
