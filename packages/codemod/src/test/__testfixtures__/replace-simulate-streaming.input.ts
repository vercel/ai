// @ts-nocheck
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';

// Basic example from breaking change doc
export async function testBasicSimulateStreaming() {
  const result = generateText({
    model: openai('gpt-4o', { simulateStreaming: true }),
    prompt: 'Hello, world!',
  });
  return result;
}

// With other provider
export async function testAnthropicSimulateStreaming() {
  const result = generateText({
    model: anthropic('claude-3-sonnet-20240229', { simulateStreaming: true }),
    prompt: 'Hello, world!',
  });
  return result;
}

// With other options
export async function testWithOtherOptions() {
  const result = generateText({
    model: openai('gpt-4o', {
      simulateStreaming: true,
      maxTokens: 100,
      temperature: 0.5,
    }),
    prompt: 'Generate text',
  });
  return result;
}

// With streamText
export async function testStreamText() {
  const result = streamText({
    model: openai('gpt-3.5-turbo', { simulateStreaming: true }),
    prompt: 'Stream this text',
  });
  return result;
}

// Stored in variable
export async function testStoredInVariable() {
  const model = openai('gpt-4o', { simulateStreaming: true });
  const result = generateText({
    model,
    prompt: 'Hello from variable',
  });
  return result;
}

// Multiple calls
export async function testMultipleCalls() {
  const result1 = generateText({
    model: openai('gpt-4o', { simulateStreaming: true }),
    prompt: 'First call',
  });

  const result2 = generateText({
    model: anthropic('claude-3-haiku-20240307', { simulateStreaming: true }),
    prompt: 'Second call',
  });

  return [result1, result2];
}

// Should not transform - simulateStreaming: false
export async function testSimulateStreamingFalse() {
  const result = generateText({
    model: openai('gpt-4o', { simulateStreaming: false }),
    prompt: 'Should not change',
  });
  return result;
}

// Should not transform - no simulateStreaming
export async function testNoSimulateStreaming() {
  const result = generateText({
    model: openai('gpt-4o', { temperature: 0.7 }),
    prompt: 'Should not change',
  });
  return result;
}
