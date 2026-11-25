import 'dotenv/config';
import { perplexity } from '@ai-sdk/perplexity';
import {
  APICallError,
  generateText,
  isStepCount,
  Output,
  streamText,
  tool,
} from 'ai';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';

const webSearchPrompt =
  'Find the official TypeScript website and describe TypeScript in one sentence with a citation.';

describe('Perplexity Agent API', () => {
  it('generates a grounded answer with a preset', async () => {
    const result = await generateText({
      model: perplexity('fast'),
      prompt: webSearchPrompt,
      maxOutputTokens: 1024,
      maxRetries: 0,
    });

    expect(result.text).toBeTruthy();
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.providerMetadata?.perplexity?.cost).toBeTruthy();
  }, 120000);

  it('streams a grounded answer with unique sources', async () => {
    const result = streamText({
      model: perplexity('fast'),
      prompt: webSearchPrompt,
      maxOutputTokens: 1024,
      maxRetries: 0,
    });
    await result.consumeStream();

    expect(await result.text).toBeTruthy();
    expect(await result.finishReason).toBe('stop');
    const sources = (await result.sources).filter(
      source => source.sourceType === 'url',
    );
    expect(sources.length).toBeGreaterThan(0);
    expect(new Set(sources.map(source => source.url)).size).toBe(
      sources.length,
    );
    expect((await result.usage).totalTokens).toBeGreaterThan(0);
  }, 120000);

  it('accepts a direct Agent API model ID', async () => {
    const result = await generateText({
      model: perplexity('perplexity/sonar'),
      prompt: 'What is 2 + 2? Answer briefly.',
      maxOutputTokens: 128,
      maxRetries: 0,
    });
    expect(result.text).toContain('4');
  }, 120000);

  it('generates structured output', async () => {
    const result = await generateText({
      model: perplexity('low'),
      prompt: 'Return the city Paris and country France.',
      output: Output.object({
        schema: z.object({ city: z.string(), country: z.string() }),
      }),
      maxOutputTokens: 512,
      maxRetries: 0,
    });
    expect(result.output).toEqual({ city: 'Paris', country: 'France' });
  }, 120000);

  it.each(['generate', 'stream'] as const)(
    'continues after a client function call with %s',
    async mode => {
      let calls = 0;
      const options = {
        model: perplexity('low'),
        prompt:
          'Call lookupToken to get the token, then report the token exactly. Do not search the web.',
        tools: {
          lookupToken: tool({
            description: 'Retrieve the token. Only this tool knows it.',
            inputSchema: z.object({}),
            execute: async () => {
              calls++;
              return 'opal-7291';
            },
          }),
        },
        stopWhen: isStepCount(3),
        maxOutputTokens: 1024,
        maxRetries: 0,
      };
      const result =
        mode === 'generate' ? await generateText(options) : streamText(options);
      expect(await result.text).toContain('opal-7291');
      expect(calls).toBeGreaterThan(0);
      expect((await result.steps).length).toBeGreaterThan(1);
    },
    120000,
  );

  it('accepts inline image input', async () => {
    const result = await generateText({
      model: perplexity('low'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Name the animal in this image in one word.',
            },
            {
              type: 'file',
              mediaType: 'image/png',
              data: readFileSync('./data/comic-cat.png'),
            },
          ],
        },
      ],
      maxOutputTokens: 256,
      maxRetries: 0,
    });
    expect(result.text.toLowerCase()).toContain('cat');
  }, 120000);

  it('reports an invalid model as an API error', async () => {
    await expect(
      generateText({
        model: perplexity('no-such-model'),
        prompt: 'This should fail',
        maxRetries: 0,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        APICallError.isInstance(error) &&
        error.statusCode != null &&
        error.statusCode >= 400 &&
        error.statusCode < 500,
    );
  }, 120000);
});
