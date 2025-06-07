import { describe, it, expect } from 'vitest';
import { FileInfo, API } from 'jscodeshift';
import transform from '../codemods/move-provider-options';

describe('move-provider-options', () => {
  it('should detect provider options and add guidance messages', () => {
    const fileInfo: FileInfo = {
      path: 'test.ts',
      source: `
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { embed, generateText } from 'ai';

export async function test1() {
  const { embedding } = await embed({
    model: openai('gpt-4o', {
      dimensions: 10
    }),
  });
  return embedding;
}

export async function test2() {
  const { text } = await generateText({
    model: anthropic('claude-3-haiku', {
      cacheControl: true
    }),
    prompt: 'Hello world',
  });
  return text;
}

export async function test3() {
  const { text } = await generateText({
    model: openai('gpt-4o', {
      dimensions: 10
    }),
    prompt: 'Hello',
    providerOptions: {
      anthropic: {
        cacheControl: true
      }
    }
  });
  return text;
}
      `.trim()
    };

    const messages: string[] = [];
    const api: API = {
      jscodeshift: require('jscodeshift'),
      report: (message: string) => {
        messages.push(message);
      }
    } as any;

    const result = transform(fileInfo, api, {});

    // Should not transform the code (return null for no changes)
    expect(result).toBeNull();

    // Should have captured messages via api.report
    expect(messages).toHaveLength(10);

    expect(messages[0]).toContain('Found 3 AI method call(s) that need provider options migration:');
    expect(messages[1]).toContain('Line 6: embed() - move provider options to providerOptions: { openai: { ... } }');
    expect(messages[2]).toContain('Line 15: generateText() - move provider options to providerOptions: { anthropic: { ... } }');
    expect(messages[3]).toContain('Line 25: generateText() - add "openai: { ... }" to existing providerOptions');
    expect(messages[4]).toBe('');
    expect(messages[5]).toContain('Migration example:');
    expect(messages[6]).toContain('Before: model: openai("gpt-4o", { dimensions: 10 })');
    expect(messages[7]).toContain('After:  model: openai("gpt-4o"),');
    expect(messages[8]).toContain('providerOptions: { openai: { dimensions: 10 } }');
    expect(messages[9]).toBe('');
  });

  it('should not report anything for code without provider options', () => {
    const fileInfo: FileInfo = {
      path: 'test.ts',
      source: `
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export async function test() {
  const { text } = await generateText({
    model: openai('gpt-4o'),
    prompt: 'Hello world',
  });
  return text;
}
      `.trim()
    };

    const messages: string[] = [];
    const api: API = {
      jscodeshift: require('jscodeshift'),
      report: (message: string) => {
        messages.push(message);
      }
    } as any;

    const result = transform(fileInfo, api, {});

    // Should not transform the code (return null for no changes)
    expect(result).toBeNull();

    // Should not have any messages
    expect(messages).toHaveLength(0);
  });
}); 