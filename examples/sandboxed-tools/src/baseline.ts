/**
 * baseline.ts — direct tool calling without sandboxing.
 *
 * The model sees all N tools individually and must call them one by one,
 * re-entering the model context for each round-trip.
 *
 * Run:  pnpm baseline
 */

import { MockLanguageModelV4 } from 'ai/test';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';

const tools = {
  add: tool({
    description: 'Add two numbers',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => ({ result: a + b }),
  }),
  multiply: tool({
    description: 'Multiply two numbers',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => ({ result: a * b }),
  }),
  formatCurrency: tool({
    description: 'Format a number as USD currency string',
    inputSchema: z.object({ amount: z.number() }),
    execute: async ({ amount }) => ({ formatted: `$${amount.toFixed(2)}` }),
  }),
};

// Deterministic mock: (3 + 4) * 2 = 14 → "$14.00"
// The model issues three separate tool calls, each re-entering the context.
const model = new MockLanguageModelV4({
  doGenerate: async ({ prompt }) => {
    const toolMessages = prompt.filter(m => m.role === 'tool');
    const calledTools = toolMessages.flatMap(m =>
      m.content.map((c: { toolName: string }) => c.toolName),
    );

    const mkUsage = (input: number, output: number) => ({
      inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: output, text: output, reasoning: undefined },
    });

    if (!calledTools.includes('add')) {
      return {
        content: [{ type: 'tool-call' as const, toolCallId: 'c1', toolName: 'add', input: '{"a":3,"b":4}' }],
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage: mkUsage(120, 18),
        warnings: [],
      };
    }
    if (!calledTools.includes('multiply')) {
      return {
        content: [{ type: 'tool-call' as const, toolCallId: 'c2', toolName: 'multiply', input: '{"a":7,"b":2}' }],
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage: mkUsage(155, 20),
        warnings: [],
      };
    }
    if (!calledTools.includes('formatCurrency')) {
      return {
        content: [{ type: 'tool-call' as const, toolCallId: 'c3', toolName: 'formatCurrency', input: '{"amount":14}' }],
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage: mkUsage(190, 22),
        warnings: [],
      };
    }
    return {
      content: [{ type: 'text' as const, text: '$14.00' }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: mkUsage(220, 10),
      warnings: [],
    };
  },
});

async function main() {
  const start = performance.now();

  const result = await generateText({
    model,
    tools,
    stopWhen: isStepCount(10),
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
