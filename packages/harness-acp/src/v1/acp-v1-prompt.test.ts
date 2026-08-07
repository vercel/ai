import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1Prompt,
} from '@ai-sdk/harness';
import { describe, expect, it } from 'vitest';
import {
  convertHarnessPromptToACPTextBlocks,
  prependACPInitialGuidance,
} from './acp-v1-prompt';

describe('convertHarnessPromptToACPTextBlocks', () => {
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
  ] satisfies Array<{
    name: string;
    prompt: HarnessV1Prompt;
    expected: Array<{ type: 'text'; text: string }>;
  }>)('maps a $name to ACP text blocks', ({ prompt, expected }) => {
    expect(
      convertHarnessPromptToACPTextBlocks({
        prompt,
        harnessId: 'portable-acp',
      }),
    ).toEqual(expected);
  });

  it.each([
    {
      name: 'legacy image part',
      part: { type: 'image', image: new Uint8Array() },
      category: 'image content',
    },
    {
      name: 'image file',
      part: {
        type: 'file',
        data: new Uint8Array(),
        mediaType: 'image/png',
      },
      category: 'image content',
    },
    {
      name: 'audio file',
      part: {
        type: 'file',
        data: new Uint8Array(),
        mediaType: 'audio/mpeg',
      },
      category: 'audio content',
    },
    {
      name: 'embedded resource file',
      part: {
        type: 'file',
        data: { type: 'text', text: 'reference' },
        mediaType: 'text/plain',
      },
      category: 'embedded resource content with media type "text/plain"',
    },
    {
      name: 'other future part',
      part: { type: 'resource_link', uri: 'file:///reference.md' },
      category: 'content parts of type "resource_link"',
    },
  ])('rejects $name precisely', ({ part, category }) => {
    let error: unknown;
    try {
      convertHarnessPromptToACPTextBlocks({
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
});

describe('prependACPInitialGuidance', () => {
  it('prepends delimited instructions and a compact skill catalog', () => {
    const result = prependACPInitialGuidance({
      prompt: [
        { type: 'text', text: 'First' },
        { type: 'text', text: 'Second' },
      ],
      instructions: 'Prefer concise answers.',
      skills: [
        {
          name: 'release-notes',
          description: 'Prepare release notes.',
          path: '/home/user/.ai-sdk/harness-acp/demo/session/skills/release-notes/SKILL.md',
        },
      ],
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
          '<available-skills>\n' +
          'Load a skill only when relevant by reading its SKILL.md file at the listed absolute path.\n' +
          '- release-notes: Prepare release notes. (/home/user/.ai-sdk/harness-acp/demo/session/skills/release-notes/SKILL.md)\n' +
          '</available-skills>\n' +
          '</session-guidance>',
      },
      { type: 'text', text: 'First' },
      { type: 'text', text: 'Second' },
    ]);
    expect(result[0]?.text).not.toContain('Complete private skill content');
  });

  it('does not add an empty guidance block', () => {
    expect(
      prependACPInitialGuidance({
        prompt: [{ type: 'text', text: 'Hello' }],
        instructions: '',
        skills: [],
      }),
    ).toEqual([{ type: 'text', text: 'Hello' }]);
  });
});
