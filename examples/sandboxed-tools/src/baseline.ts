/**
 * baseline.ts — direct tool calling without sandboxing.
 *
 * The model sees all N tools individually and must call them one by one,
 * re-entering the model context for each round-trip.
 *
 * Run:  pnpm baseline
 */

import { MockLanguageModelV2 } from 'ai/test';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const tools = {
  add: tool({
    description: 'Add two numbers',
    parameters: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => ({ result: a + b }),
  }),
  multiply: tool({
    description: 'Multiply two numbers',
    parameters: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => ({ result: a * b }),
  }),
  formatCurrency: tool({
    description: 'Format a number as USD currency string',
    parameters: z.object({ amount: z.number() }),
    execute: async ({ amount }) =>
      ({ formatted: `$${amount.toFixed(2)}` }),
  }),
};

// Deterministic mock: (3 + 4) * 2 = 14 → "$14.00"
// The model issues three separate tool calls, each re-entering the context.
const model = new MockLanguageModelV2({
  defaultObjectGenerationMode: 'json',
  doGenerate: async ({ prompt }) => {
    const last = prompt[prompt.length - 1];

    // Step 1 — no prior tool results yet: call add(3, 4)
    const toolResults = last.role === 'tool' ? last.content : [];
    const resultNames = toolResults.map((r: { toolName: string }) => r.toolName);

    if (!resultNames.includes('add')) {
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: 'tool-calls',
        usage: { promptTokens: 120, completionTokens: 18 },
        toolCalls: [{ toolCallType: 'function', toolCallId: 'c1', toolName: 'add', args: '{"a":3,"b":4}' }],
      };
    }
    if (!resultNames.includes('multiply')) {
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: 'tool-calls',
        usage: { promptTokens: 155, completionTokens: 20 },
        toolCalls: [{ toolCallType: 'function', toolCallId: 'c2', toolName: 'multiply', args: '{"a":7,"b":2}' }],
      };
    }
    if (!resultNames.includes('formatCurrency')) {
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: 'tool-calls',
        usage: { promptTokens: 190, completionTokens: 22 },
        toolCalls: [{ toolCallType: 'function', toolCallId: 'c3', toolName: 'formatCurrency', args: '{"amount":14}' }],
      };
    }
    return {
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: 'stop',
      usage: { promptTokens: 220, completionTokens: 10 },
      text: '$14.00',
    };
  },
});

async function main() {
  const start = performance.now();

  const result = await generateText({
    model,
    tools,
    maxSteps: 10,
    prompt: 'Add 3 and 4, multiply the result by 2, then format it as currency.',
  });

  const elapsed = Math.round(performance.now() - start);
  const usage = result.usage;

  console.log('=== Baseline (direct tool calls) ===');
  console.log('Answer:', result.text);
  console.log(`Steps:  ${result.steps.length} model round-trips`);
  console.log(`Tokens: ${usage.promptTokens} prompt + ${usage.completionTokens} completion = ${usage.totalTokens} total`);
  console.log(`Time:   ${elapsed}ms`);
}

main().catch(console.error);
