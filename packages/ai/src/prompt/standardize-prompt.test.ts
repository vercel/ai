import { InvalidPromptError } from '@ai-sdk/provider';
import { standardizePrompt } from './standardize-prompt';
import { describe, it, expect } from 'vitest';

describe('standardizePrompt', () => {
  it('should throw InvalidPromptError when system message has parts', async () => {
    await expect(async () => {
      await standardizePrompt({
        messages: [
          {
            role: 'system',
            content: [{ type: 'text', text: 'test' }] as any,
          },
        ],
      });
    }).rejects.toThrow(InvalidPromptError);
  });

  it('should throw InvalidPromptError when messages array is empty', async () => {
    await expect(async () => {
      await standardizePrompt({
        messages: [],
      });
    }).rejects.toThrow(InvalidPromptError);
  });

  it('should support SystemModelMessage system message', async () => {
    const result = await standardizePrompt({
      system: {
        role: 'system',
        content: 'INSTRUCTIONS',
      },
      prompt: 'Hello, world!',
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "messages": [
          {
            "content": "Hello, world!",
            "role": "user",
          },
        ],
        "system": {
          "content": "INSTRUCTIONS",
          "role": "system",
        },
      }
    `);
  });

  it('should support array of SystemModelMessage system messages', async () => {
    const result = await standardizePrompt({
      system: [
        { role: 'system', content: 'INSTRUCTIONS' },
        { role: 'system', content: 'INSTRUCTIONS 2' },
      ],
      prompt: 'Hello, world!',
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "messages": [
          {
            "content": "Hello, world!",
            "role": "user",
          },
        ],
        "system": [
          {
            "content": "INSTRUCTIONS",
            "role": "system",
          },
          {
            "content": "INSTRUCTIONS 2",
            "role": "system",
          },
        ],
      }
    `);
  });
});
