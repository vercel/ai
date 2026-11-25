import { describe, expect, it } from 'vitest';
import {
  escapeFormatCharacters,
  sanitizeTerminalText,
} from './sanitize-terminal-text';

describe('escapeFormatCharacters', () => {
  it('escapes bidirectional controls, zero-width characters, and tag characters', () => {
    expect(
      escapeFormatCharacters('a\u202eb\u2066c\u200bd\u200de\ufefff\u{e0041}g'),
    ).toBe('a\\u{202e}b\\u{2066}c\\u{200b}d\\u{200d}e\\u{feff}f\\u{e0041}g');
  });

  it('preserves visible characters', () => {
    expect(escapeFormatCharacters('Hello 日本語 😀 e\u0301 ☀\ufe0f')).toBe(
      'Hello 日本語 😀 e\u0301 ☀\ufe0f',
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
