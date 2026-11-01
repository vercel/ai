import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { languageModelPromptToModelMessages } from './language-model-prompt-to-model-messages';

describe('languageModelPromptToModelMessages', () => {
  it('should restore providerExecuted on tool approval responses', () => {
    const prompt: LanguageModelV4Prompt = [
      { role: 'system', content: 'You are helpful.' },
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'url', url: new URL('https://example.com/a.png') },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: 'approval-1',
            approved: true,
          },
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'weather',
            output: { type: 'text', value: 'sunny' },
          },
        ],
      },
    ];

    expect(languageModelPromptToModelMessages(prompt)).toEqual([
      prompt[0],
      prompt[1],
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: 'approval-1',
            approved: true,
            providerExecuted: true,
          },
          prompt[2].content[1],
        ],
      },
    ]);
  });
});
