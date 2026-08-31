import { describe, expect, it } from 'vitest';
import {
  sanitizeTerminalLine,
  sanitizeTerminalText,
  sliceVisible,
  stripAnsi,
  visibleLength,
} from './terminal-text';

const clipboardWrite = '\x1b]52;c;cm0gLXJmIH4K\x07';
const hyperlink = '\x1b]8;;https://evil.example\x07';
const windowTitle = '\x1b]0;pwned\x07';
const kittyGraphics = '\x1b_Ga=T,f=100;AAAA\x1b\\';
const tmuxPassthrough = '\x1bPtmux;\x1b\x1b]52;c;AAAA\x07\x1b\\';

describe('stripAnsi', () => {
  it('strips CSI sequences', () => {
    expect(stripAnsi('\x1b[92mgreen\x1b[0m')).toBe('green');
  });

  it('strips OSC sequences terminated by BEL or ST', () => {
    expect(stripAnsi(`a${clipboardWrite}b`)).toBe('ab');
    expect(stripAnsi('a\x1b]0;title\x1b\\b')).toBe('ab');
  });

  it('strips DCS, SOS, PM and APC sequences', () => {
    expect(stripAnsi(`a${kittyGraphics}b`)).toBe('ab');
    expect(stripAnsi(`a${tmuxPassthrough}b`)).toBe('ab');
    expect(stripAnsi('a\x1b^privacy\x1b\\b')).toBe('ab');
    expect(stripAnsi('a\x1bXstring\x1b\\b')).toBe('ab');
  });

  it('strips 8-bit C1 introducers', () => {
    expect(stripAnsi('a\u009b31mb')).toBe('ab');
    expect(stripAnsi('a\u009d52;c;AAAA\u009cb')).toBe('ab');
    expect(stripAnsi('a\u009fpayload\u009cb')).toBe('ab');
  });

  it('strips single escapes such as a full terminal reset', () => {
    expect(stripAnsi('a\x1bcb')).toBe('ab');
    expect(stripAnsi('a\x1b(0b')).toBe('ab');
    expect(stripAnsi('a\x1b')).toBe('a');
  });
});

describe('sanitizeTerminalText', () => {
  it('keeps plain text, newlines and tabs', () => {
    expect(sanitizeTerminalText('hello\nworld\tagain 世界 🎉')).toBe(
      'hello\nworld\tagain 世界 🎉',
    );
  });

  it('removes clipboard writes', () => {
    expect(sanitizeTerminalText(`Done!${clipboardWrite} Bye`)).toBe(
      'Done! Bye',
    );
  });

  it('removes hyperlink and window title sequences', () => {
    expect(
      sanitizeTerminalText(`${hyperlink}docs\x1b]8;;\x07${windowTitle}`),
    ).toBe('docs');
  });

  it('removes an unterminated OSC sequence together with its payload', () => {
    expect(sanitizeTerminalText('a\x1b]52;c;cm0gLXJmIH4K')).toBe('a');
    expect(sanitizeTerminalText('a\x1b]52;c;AAAA\x1b[0mb')).toBe('ab');
  });

  it('removes DCS and APC passthrough sequences', () => {
    expect(sanitizeTerminalText(`a${kittyGraphics}b`)).toBe('ab');
    expect(sanitizeTerminalText(`a${tmuxPassthrough}b`)).toBe('ab');
  });

  it('removes cursor control and device status report requests', () => {
    expect(sanitizeTerminalText('safe\x1b[2J\x1b[10A\x1b[6nspoofed')).toBe(
      'safespoofed',
    );
  });

  it('removes styling sequences so only the terminal UI can style output', () => {
    expect(sanitizeTerminalText('\x1b[92mfake success\x1b[0m')).toBe(
      'fake success',
    );
    expect(sanitizeTerminalText('\x1b[8mhidden\x1b[28m')).toBe('hidden');
  });

  it('removes control characters that move the cursor or ring the bell', () => {
    expect(sanitizeTerminalText('a\x07b\rc\bd\x7fe\x00f\x0bg')).toBe('abcdefg');
  });

  it('is idempotent', () => {
    const input = `a${clipboardWrite}b${tmuxPassthrough}c`;

    expect(sanitizeTerminalText(sanitizeTerminalText(input))).toBe(
      sanitizeTerminalText(input),
    );
  });
});

describe('sanitizeTerminalLine', () => {
  it('replaces newlines with spaces so text cannot break out of its line', () => {
    expect(sanitizeTerminalLine('title\nsecond line')).toBe(
      'title second line',
    );
  });

  it('removes escape sequences', () => {
    expect(sanitizeTerminalLine(`title${clipboardWrite}`)).toBe('title');
  });
});

describe('visibleLength', () => {
  it('does not count OSC or DCS payloads as visible cells', () => {
    expect(visibleLength(`${clipboardWrite}hello`)).toBe(5);
    expect(visibleLength(`${kittyGraphics}hello`)).toBe(5);
    expect(visibleLength('\u009d52;c;AAAA\u009chello')).toBe(5);
  });
});

describe('sliceVisible', () => {
  it('keeps the styling sequences the terminal UI emits', () => {
    expect(sliceVisible('\x1b[92mhello\x1b[0m', 10)).toBe(
      '\x1b[92mhello\x1b[0m',
    );
  });

  it('drops escape sequences that are not styling', () => {
    expect(sliceVisible(`ok${clipboardWrite} done`, 20)).toBe('ok done');
    expect(sliceVisible(`ok${kittyGraphics} done`, 20)).toBe('ok done');
    expect(sliceVisible('ok\x1b[2J\x1b[6n done', 20)).toBe('ok done');
    expect(sliceVisible('ok\x1bc done', 20)).toBe('ok done');
  });

  it('drops control characters', () => {
    expect(sliceVisible('ok\x07\r\b done', 20)).toBe('ok done');
  });
});
