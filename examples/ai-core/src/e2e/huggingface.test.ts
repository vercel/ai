import { huggingface } from '@ai-sdk/huggingface';
import { generateText, streamText, generateObject, streamObject } from 'ai';
import { describe, it, expect } from 'vitest';
import { z } from 'zod/v4';
import 'dotenv/config';

describe('HuggingFace Provider', () => {
  it('should generate text', async () => {
    const result = await generateText({
      model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
      prompt: 'Say hello',
    });

    expect(result.text).toBeTruthy();
    expect(result.usage?.inputTokens).toBeGreaterThan(0);
    expect(result.usage?.outputTokens).toBeGreaterThan(0);
  });

  it('should stream text', async () => {
    const result = streamText({
      model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
      prompt: 'Count from 1 to 3',
    });

    const chunks = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toBeTruthy();
  });

  it('should generate object', async () => {
    const result = await generateObject({
      model: huggingface.responses('moonshotai/Kimi-K2-Instruct'),
      schema: z.object({
        name: z.string(),
        age: z.number(),
      }),
      prompt: 'Generate a person with name and age',
    });

    expect(result.object).toMatchObject({
      name: expect.any(String),
      age: expect.any(Number),
    });
    expect(result.usage?.inputTokens).toBe(0);
  });

  it('should stream object', async () => {
    const result = streamObject({
      model: huggingface.responses('moonshotai/Kimi-K2-Instruct'),
      schema: z.object({
        items: z.array(z.string()),
      }),
      prompt: 'Generate a list of 3 colors',
    });

    const partialObjects = [];
    for await (const partialObject of result.partialObjectStream) {
      partialObjects.push(partialObject);
    }

    expect(partialObjects.length).toBeGreaterThan(0);
    expect(partialObjects[partialObjects.length - 1]).toHaveProperty('items');
  });

  it('should handle multi-message conversations', async () => {
    const result = await generateText({
      model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there! How can I help you?' },
        { role: 'user', content: 'What is 2 + 2?' },
      ],
    });

    expect(result.text).toBeTruthy();
    expect(result.usage?.inputTokens).toBeGreaterThan(0);
  });

  it('should handle system messages', async () => {
    const result = await generateText({
      model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
      system: 'You are a helpful assistant that responds with exactly one word.',
      prompt: 'Say hello',
    });

    expect(result.text).toBeTruthy();
    expect(result.usage?.inputTokens).toBeGreaterThan(0);
  });

  it('should respect temperature settings', async () => {
    const result = await generateText({
      model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
      prompt: 'Generate a random number',
      temperature: 0.1,
    });

    expect(result.text).toBeTruthy();
    expect(result.usage?.inputTokens).toBeGreaterThan(0);
  });

  it('should respect max tokens', async () => {
    const result = await generateText({
      model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
      prompt: 'Write a long story',
      maxOutputTokens: 10,
    });

    expect(result.text).toBeTruthy();
    expect(result.usage?.outputTokens).toBeLessThanOrEqual(10);
  });
});
