import { describe, expect, it } from 'vitest';
import {
  sanitizeTerminalLine,
  sanitizeTerminalText,
  sliceVisible,
  stripAnsi,
  visibleLength,
} from './terminal-text';

describe('sanitizeTerminalText', () => {
  it('removes OSC sequences terminated by BEL', () => {
    expect(sanitizeTerminalText('before\x1b]52;c;ZXZpbA==\x07after')).toBe(
      'beforeafter',
    );
  });

  it('removes OSC sequences terminated by ST', () => {
    expect(sanitizeTerminalText('before\x1b]0;window title\x1b\\after')).toBe(
      'beforeafter',
    );
  });

  it('removes OSC hyperlinks and keeps their label', () => {
    expect(
      sanitizeTerminalText(
        '\x1b]8;;https://evil.example\x1b\\docs\x1b]8;;\x1b\\',
      ),
    ).toBe('docs');
  });

  it('removes DCS sequences, including multiplexer passthrough', () => {
    expect(
      sanitizeTerminalText('\x1bPtmux;\x1b\x1b]52;c;ZXZpbA==\x07\x1b\\after'),
    ).toBe('after');
  });

  it('removes APC, PM and SOS sequences', () => {
    expect(sanitizeTerminalText('a\x1b_Ga=T,f=100;payload\x1b\\b')).toBe('ab');
    expect(sanitizeTerminalText('a\x1b^message\x1b\\b')).toBe('ab');
    expect(sanitizeTerminalText('a\x1bXmessage\x1b\\b')).toBe('ab');
  });

  it('removes sequences that are still incomplete', () => {
    expect(sanitizeTerminalText('before\x1b]52;c;ZXZp')).toBe('before');
    expect(sanitizeTerminalText('before\x1bPtmux;')).toBe('before');
    expect(sanitizeTerminalText('before\x1b[38;5')).toBe('before');
    expect(sanitizeTerminalText('before\x1b')).toBe('before');
  });

  it('removes CSI sequences, including cursor movement and mode changes', () => {
    expect(sanitizeTerminalText('a\x1b[2J\x1b[H\x1b[?1049h\x1b[31mb')).toBe(
      'ab',
    );
  });

  it('removes two-character and charset escape sequences', () => {
    expect(sanitizeTerminalText('a\x1bcb')).toBe('ab');
    expect(sanitizeTerminalText('a\x1b(0b')).toBe('ab');
    expect(sanitizeTerminalText('a\x1b7b')).toBe('ab');
  });

  it('removes control characters but keeps newlines', () => {
    expect(sanitizeTerminalText('a\rb\x08c\x07d\x00e')).toBe('abcde');
    expect(sanitizeTerminalText('first\nsecond')).toBe('first\nsecond');
    expect(sanitizeTerminalText('first\r\nsecond')).toBe('first\nsecond');
  });

  it('removes 8-bit control characters, including sequence introducers', () => {
    expect(sanitizeTerminalText('a\u009b31mb\u009d0;title\u0007')).toBe(
      'a31mb0;title',
    );
  });

  it('expands tabs to the width they are measured with', () => {
    expect(sanitizeTerminalText('a\tb')).toBe('a    b');
    expect(visibleLength('a\tb')).toBe(visibleLength('a    b'));
  });

  it('keeps printable text unchanged', () => {
    const text = 'héllo 世界 ✓ **bold** `code` 🙂';

    expect(sanitizeTerminalText(text)).toBe(text);
  });

  it('is idempotent', () => {
    const text = 'a\x1b]52;c;ZXZpbA==\x07b\x1b[31mc\rd\te';
    const sanitized = sanitizeTerminalText(text);

    expect(sanitizeTerminalText(sanitized)).toBe(sanitized);
  });
});

describe('sanitizeTerminalLine', () => {
  it('replaces newlines with spaces', () => {
    expect(sanitizeTerminalLine('first\nsecond')).toBe('first second');
  });

  it('removes escape sequences', () => {
    expect(sanitizeTerminalLine('shell\x1b]52;c;ZXZpbA==\x07')).toBe('shell');
  });
});

describe('visibleLength', () => {
  it('does not count escape sequences as terminal cells', () => {
    expect(visibleLength('\x1b]52;c;ZXZpbA==\x07hi')).toBe(2);
    expect(visibleLength('\x1bPtmux;payload\x1b\\hi')).toBe(2);
    expect(visibleLength('\x1b[1mhi\x1b[22m')).toBe(2);
  });
});

describe('sliceVisible', () => {
  it('keeps styling sequences', () => {
    expect(sliceVisible('\x1b[1mbold\x1b[22m', 4)).toBe('\x1b[1mbold\x1b[22m');
  });

  it('drops sequences that are not text styling', () => {
    expect(sliceVisible('\x1b]52;c;ZXZpbA==\x07hello', 5)).toBe('hello');
    expect(sliceVisible('a\x1b[10;10Hb', 2)).toBe('ab');
  });
});

describe('stripAnsi', () => {
  it('strips all escape sequences', () => {
    expect(stripAnsi('\x1b]0;title\x07a\x1b[31mb\x1bPtmux;c\x1b\\')).toBe('ab');
  });
});
