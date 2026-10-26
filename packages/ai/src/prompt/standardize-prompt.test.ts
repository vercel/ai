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
        "instructions": undefined,
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
        "instructions": undefined,
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

  it('should throw InvalidPromptError for an invalid message', async () => {
    await expect(
      standardizePrompt({
        messages: [{ role: 'assistant', content: 42 } as any],
      }),
    ).rejects.toThrow(InvalidPromptError);
  });

  it('should not re-validate a message object that already passed validation', async () => {
    const message = { role: 'user' as const, content: 'Hello' };
    await standardizePrompt({ messages: [message] });

    // a second call that re-validated the object would now throw:
    (message as { content: unknown }).content = 42;

    await expect(
      standardizePrompt({ messages: [message] }),
    ).resolves.toMatchObject({ messages: [message] });
  });

  it('should validate a new message appended to an already validated history', async () => {
    const history = [{ role: 'user' as const, content: 'Hello' }];
    await standardizePrompt({ messages: history });

    await expect(
      standardizePrompt({
        messages: [...history, { role: 'assistant', content: 42 } as any],
      }),
    ).rejects.toThrow(InvalidPromptError);
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
        "instructions": {
          "content": "INSTRUCTIONS",
          "role": "system",
        },
        "messages": [
          {
            "content": "Hello, world!",
            "role": "user",
          },
        ],
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
        "instructions": [
          {
            "content": "INSTRUCTIONS",
            "role": "system",
          },
          {
            "content": "INSTRUCTIONS 2",
            "role": "system",
          },
        ],
        "messages": [
          {
            "content": "Hello, world!",
            "role": "user",
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
        "instructions": "SYSTEM",
        "messages": [
          {
            "content": "Hello, world!",
            "role": "user",
          },
        ],
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
        "instructions": "INSTRUCTIONS",
        "messages": [
          {
            "content": "Hello, world!",
            "role": "user",
          },
        ],
      }
    `);
  });
});
