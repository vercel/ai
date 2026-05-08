import { InvalidPromptError } from '@ai-sdk/provider';
import { standardizePrompt } from './standardize-prompt';
import { describe, it, expect } from 'vitest';

describe('standardizePrompt', () => {
  it('should throw InvalidPromptError when messages contain a system message by default', async () => {
    await expect(async () => {
      await standardizePrompt({
        messages: [
          {
            role: 'system',
            content: 'INSTRUCTIONS',
          },
        ],
      });
    }).rejects.toThrow(InvalidPromptError);
  });

  it('should throw InvalidPromptError when prompt messages contain a system message by default', async () => {
    await expect(async () => {
      await standardizePrompt({
        prompt: [
          {
            role: 'system',
            content: 'INSTRUCTIONS',
          },
        ],
      });
    }).rejects.toThrow(InvalidPromptError);
  });

  it('should allow system messages in messages when allowSystemInMessages is true', async () => {
    const result = await standardizePrompt({
      allowSystemInMessages: true,
      messages: [
        {
          role: 'system',
          content: 'INSTRUCTIONS',
        },
        {
          role: 'user',
          content: 'Hello, world!',
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "messages": [
          {
            "content": "INSTRUCTIONS",
            "role": "system",
          },
          {
            "content": "Hello, world!",
            "role": "user",
          },
        ],
        "system": undefined,
      }
    `);
  });

  it('should allow system messages in prompt messages when allowSystemInMessages is true', async () => {
    const result = await standardizePrompt({
      allowSystemInMessages: true,
      prompt: [
        {
          role: 'system',
          content: 'INSTRUCTIONS',
        },
        {
          role: 'user',
          content: 'Hello, world!',
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "messages": [
          {
            "content": "INSTRUCTIONS",
            "role": "system",
          },
          {
            "content": "Hello, world!",
            "role": "user",
          },
        ],
        "system": undefined,
      }
    `);
  });

  it('should throw InvalidPromptError when an allowed system message has parts', async () => {
    await expect(async () => {
      await standardizePrompt({
        allowSystemInMessages: true,
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

  it('should support SystemModelMessage instructions', async () => {
    const result = await standardizePrompt({
      instructions: {
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

  it('should support array of SystemModelMessage instructions', async () => {
    const result = await standardizePrompt({
      instructions: [
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

  it('should fall back to system when instructions is not defined', async () => {
    const result = await standardizePrompt({
      system: 'SYSTEM',
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
        "system": "SYSTEM",
      }
    `);
  });

  it('should prefer instructions over system', async () => {
    const result = await standardizePrompt({
      instructions: 'INSTRUCTIONS',
      system: 'SYSTEM',
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
        "system": "INSTRUCTIONS",
      }
    `);
  });
});
