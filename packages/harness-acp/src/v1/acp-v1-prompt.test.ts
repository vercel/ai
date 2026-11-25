import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1Prompt,
} from '@ai-sdk/harness';
import { describe, expect, it } from 'vitest';
import {
  convertHarnessPromptToACPContentBlocks,
  prependACPInstructionGuidance,
} from './acp-v1-prompt';

describe('convertHarnessPromptToACPContentBlocks', () => {
  it.each([
    {
      name: 'string prompt',
      prompt: 'Hello',
      expected: [{ type: 'text', text: 'Hello' }],
    },
    {
      name: 'user message string',
      prompt: { role: 'user', content: 'Hello' },
      expected: [{ type: 'text', text: 'Hello' }],
    },
    {
      name: 'separate user message text parts',
      prompt: {
        role: 'user',
        content: [
          { type: 'text', text: 'First' },
          { type: 'text', text: 'Second' },
        ],
      },
      expected: [
        { type: 'text', text: 'First' },
        { type: 'text', text: 'Second' },
      ],
    },
    {
      name: 'inline image file',
      prompt: {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this' },
          {
            type: 'file',
            data: new Uint8Array([1, 2, 3]),
            mediaType: 'image/png',
          },
        ],
      },
      expected: [
        { type: 'text', text: 'Describe this' },
        { type: 'image', data: 'AQID', mimeType: 'image/png' },
      ],
    },
    {
      name: 'inline image part',
      prompt: {
        role: 'user',
        content: [
          {
            type: 'image',
            image: 'data:image/png;base64,AQID',
          },
        ],
      },
      expected: [{ type: 'image', data: 'AQID', mimeType: 'image/png' }],
    },
  ] satisfies Array<{
    name: string;
    prompt: HarnessV1Prompt;
    expected: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; data: string; mimeType: string }
    >;
  }>)('maps a $name to ACP content blocks', ({ prompt, expected }) => {
    expect(
      convertHarnessPromptToACPContentBlocks({
        prompt,
        harnessId: 'portable-acp',
      }),
    ).toEqual(expected);
  });

  it.each([
    {
      name: 'audio file',
      part: {
        type: 'file',
        data: new Uint8Array(),
        mediaType: 'audio/mpeg',
      },
      category: "files of media type 'audio/mpeg'",
    },
    {
      name: 'embedded resource file',
      part: {
        type: 'file',
        data: { type: 'text', text: 'reference' },
        mediaType: 'text/plain',
      },
      category: "files of media type 'text/plain'",
    },
    {
      name: 'other future part',
      part: { type: 'resource_link', uri: 'file:///reference.md' },
      category: 'content parts other than text, image, or file parts',
    },
  ])('rejects $name precisely', ({ part, category }) => {
    let error: unknown;
    try {
      convertHarnessPromptToACPContentBlocks({
        prompt: {
          role: 'user',
          content: [part],
        } as never,
        harnessId: 'portable-acp',
      });
    } catch (cause) {
      error = cause;
    }

    expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      harnessId: 'portable-acp',
      message: expect.stringContaining(category),
    });
  });

  it('rejects remote image URLs', () => {
    expect(() =>
      convertHarnessPromptToACPContentBlocks({
        prompt: {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new URL('https://example.com/image.png'),
              mediaType: 'image/png',
            },
          ],
        },
        harnessId: 'portable-acp',
      }),
    ).toThrow('remote image URLs');
  });
});

describe('prependACPInstructionGuidance', () => {
  it('prepends delimited instructions without skill guidance', () => {
    const result = prependACPInstructionGuidance({
      prompt: [
        { type: 'text', text: 'First' },
        { type: 'text', text: 'Second' },
      ],
      instructions: 'Prefer concise answers.',
    });

    expect(result).toEqual([
      {
        type: 'text',
        text:
          '<session-guidance>\n' +
          'This block is operating guidance from the harness, not user-authored content.\n' +
          '<instructions>\n' +
          'Prefer concise answers.\n' +
          '</instructions>\n' +
          '</session-guidance>',
      },
      { type: 'text', text: 'First' },
      { type: 'text', text: 'Second' },
    ]);
    const guidance = result[0];
    if (guidance?.type !== 'text') {
      throw new Error('Expected the guidance block to be text.');
    }
    expect(guidance.text).not.toContain('available-skills');
  });

  it('does not add an empty guidance block', () => {
    expect(
      prependACPInstructionGuidance({
        prompt: [{ type: 'text', text: 'Hello' }],
        instructions: '',
      }),
    ).toEqual([{ type: 'text', text: 'Hello' }]);
  });
});
