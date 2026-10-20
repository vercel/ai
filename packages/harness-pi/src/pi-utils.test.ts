import { describe, expect, it } from 'vitest';
import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import {
  extractPiPromptContent,
  frameInstructions,
  renderPiSkillFile,
  safePiMetadataSegment,
  serializeToolOutput,
} from './pi-utils';

describe('frameInstructions', () => {
  it('wraps instructions as system guidance and fences the user text', () => {
    const framed = frameInstructions('Use turbo build.', 'do the thing');
    expect(framed).toContain('<session-instructions>');
    expect(framed).toContain('Use turbo build.');
    expect(framed).toContain('</session-instructions>');
    expect(framed).toContain('<user-message>\ndo the thing\n</user-message>');
    expect(framed).toMatch(/not a message from the user/i);
    // Instructions must come before the user message.
    expect(framed.indexOf('<session-instructions>')).toBeLessThan(
      framed.indexOf('<user-message>'),
    );
  });
});

describe('extractPiPromptContent', () => {
  it('returns the string prompt as text', () => {
    expect(extractPiPromptContent({ prompt: 'hello there' })).toEqual({
      text: 'hello there',
      images: [],
    });
  });

  it('joins multiple text parts with double newlines', () => {
    const prompt = extractPiPromptContent({
      prompt: {
        role: 'user',
        content: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
        ],
      },
    });
    expect(prompt).toEqual({ text: 'first\n\nsecond', images: [] });
  });

  it('handles a single string content', () => {
    expect(
      extractPiPromptContent({
        prompt: { role: 'user', content: 'just text' },
      }),
    ).toEqual({ text: 'just text', images: [] });
  });

  it('extracts inline image data', () => {
    expect(
      extractPiPromptContent({
        prompt: {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this.' },
            {
              type: 'image',
              image: new Uint8Array([1, 2, 3]),
              mediaType: 'image/png',
            },
          ],
        },
      }),
    ).toEqual({
      text: 'Describe this.',
      images: [{ type: 'image', data: 'AQID', mimeType: 'image/png' }],
    });
  });

  it('rejects text parts after an inline image', () => {
    expect(() =>
      extractPiPromptContent({
        prompt: {
          role: 'user',
          content: [
            {
              type: 'image',
              image: new Uint8Array([1, 2]),
              mediaType: 'image/png',
            },
            { type: 'text', text: 'after' },
          ],
        },
      }),
    ).toThrowError(HarnessCapabilityUnsupportedError);
  });

  it('throws for unsupported user content parts', () => {
    let error: unknown;
    try {
      extractPiPromptContent({
        prompt: {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new Uint8Array([1, 2]),
              mediaType: 'text/plain',
            },
          ],
        },
      });
    } catch (caughtError) {
      error = caughtError;
    }
    expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
  });
});

describe('serializeToolOutput', () => {
  it('returns strings unchanged', () => {
    expect(serializeToolOutput('hello')).toBe('hello');
  });

  it('JSON-stringifies objects', () => {
    expect(serializeToolOutput({ a: 1 })).toBe('{"a":1}');
  });

  it('returns "null" for undefined', () => {
    expect(serializeToolOutput(undefined)).toBe('null');
  });
});

describe('safePiMetadataSegment', () => {
  it('accepts alphanumeric, dots, dashes, underscores', () => {
    expect(safePiMetadataSegment('my-skill_1.0', 'skill')).toBe('my-skill_1.0');
  });

  it('rejects path traversal attempts', () => {
    expect(() => safePiMetadataSegment('..', 'skill')).toThrow();
    expect(() => safePiMetadataSegment('.', 'skill')).toThrow();
    expect(() => safePiMetadataSegment('a/b', 'skill')).toThrow();
    expect(() => safePiMetadataSegment('a b', 'skill')).toThrow();
  });
});

describe('renderPiSkillFile', () => {
  it('emits YAML frontmatter followed by content', () => {
    const rendered = renderPiSkillFile({
      name: 'refactor',
      description: 'Refactor carefully.',
      content: 'Make small changes.',
    });
    expect(rendered).toBe(
      `---\nname: refactor\ndescription: Refactor carefully.\n---\n\nMake small changes.`,
    );
  });
});
