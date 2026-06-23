/**
 * sandboxed.ts — sandboxed tool execution via codeModeTool.
 *
 * Instead of giving the model three separate tools, we wrap them all in a
 * single `execute_code` tool backed by a QuickJS WASM kernel. The model
 * emits one JavaScript snippet that orchestrates all three calls internally —
 * only the final result re-enters the model context.
 *
 * Benefits:
 *   - Fewer model round-trips (1 instead of 3 for this task)
 *   - Lower token usage at scale (N tools → 1 tool in the model's context)
 *   - The LLM-emitted code runs inside an isolated WASM sandbox, not the
 *     host runtime — network, filesystem, and env access are gated by the
 *     CapabilityManifest you pass.
 *
 * When NOT to use this pattern:
 *   - When the tool count is small (< 3) and latency from extra round-trips
 *     is acceptable — direct tool calls are simpler to debug.
 *   - When tools must stream partial results back to the user between calls.
 *   - When audit requirements demand logging every individual tool invocation
 *     rather than the composite script.
 *
 * Run:  pnpm sandboxed
 */

import { MockLanguageModelV4 } from 'ai/test';
import { generateText, isStepCount } from 'ai';
import { codeModeTool } from '@wasmagent/aisdk';
import { QuickJSKernel } from '@wasmagent/kernel-quickjs';
import { ToolRegistry } from '@wasmagent/core';
import { z } from 'zod';

// 1. Register the same three tools in an agentkit ToolRegistry.
//    The registry is invisible to the model — it only sees execute_code.
const registry = new ToolRegistry();

registry.register('add', {
  description: 'Add two numbers',
  parameters: z.object({ a: z.number(), b: z.number() }),
  execute: async ({ a, b }: { a: number; b: number }) => ({ result: a + b }),
});

registry.register('multiply', {
  description: 'Multiply two numbers',
  parameters: z.object({ a: z.number(), b: z.number() }),
  execute: async ({ a, b }: { a: number; b: number }) => ({ result: a * b }),
});

registry.register('formatCurrency', {
  description: 'Format a number as USD currency string',
  parameters: z.object({ amount: z.number() }),
  execute: async ({ amount }: { amount: number }) => ({ formatted: `$${amount.toFixed(2)}` }),
});

// 2. Wrap the registry in a single AI SDK tool backed by QuickJSKernel.
//    The capability manifest is deny-all by default; opt-in to specific hosts,
//    env vars, or resource limits here if your tools need them.
const sandboxedExecute = codeModeTool({
  kernel: new QuickJSKernel({ timeoutMs: 5000 }),
  tools: registry,
  capabilities: {
    cpuMs: 5000,
  },
});

// Deterministic mock: the model emits one JS snippet that chains all three
// calls via callTool(), then returns the formatted result in one step.
const model = new MockLanguageModelV4({
  doGenerate: async ({ prompt }) => {
    const hasToolResult = prompt.some(m => m.role === 'tool');

    const mkUsage = (input: number, output: number) => ({
      inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: output, text: output, reasoning: undefined },
    });

    if (!hasToolResult) {
      // Single tool call — the model composes all logic in one script
      const code = `
        const { result: sum }     = await callTool('add',           { a: 3, b: 4 });
        const { result: product } = await callTool('multiply',      { a: sum, b: 2 });
        const { formatted }       = await callTool('formatCurrency', { amount: product });
        return formatted;
      `;
      return {
        content: [{
          type: 'tool-call' as const,
          toolCallId: 'c1',
          toolName: 'execute_code',
          input: JSON.stringify({ code }),
        }],
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage: mkUsage(95, 55),
        warnings: [],
      };
    }

    // The kernel resolved the script; the model just reads the output.
    return {
      content: [{ type: 'text' as const, text: '$14.00' }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: mkUsage(160, 8),
      warnings: [],
    };
  },
});

async function main() {
  const start = performance.now();

  const result = await generateText({
    model,
    tools: { execute_code: sandboxedExecute },
    stopWhen: isStepCount(5),
    prompt: 'Add 3 and 4, multiply the result by 2, then format it as currency.',
  });

  const elapsed = Math.round(performance.now() - start);
  const usage = result.usage;

  console.log('=== Sandboxed (codeModeTool + QuickJSKernel) ===');
  console.log('Answer:', result.text);
  console.log(`Steps:  ${result.steps.length} model round-trip(s)`);
  console.log(`Tokens: ${usage.promptTokens} prompt + ${usage.completionTokens} completion = ${usage.totalTokens} total`);
  console.log(`Time:   ${elapsed}ms`);

  console.log('\n--- Comparison table ---');
  console.log('| Metric            | Baseline (direct) | Sandboxed (codeMode) |');
  console.log('|-------------------|:-----------------:|:--------------------:|');
  console.log('| Model round-trips |         3         |          1           |');
  console.log('| Prompt tokens     |       ~485        |        ~255          |');
  console.log('| Tool slots in ctx |         3         |          1           |');
  console.log('| Execution sandbox |       none        |   QuickJS WASM       |');
  console.log('\nNote: token counts above are from the mock model.');
  console.log('With a real provider at N=30 tools, prompt savings reach ~86%.');
  console.log('See: https://github.com/WasmAgent/wasmagent-js/tree/main/examples/benchmarks');
}

main().catch(console.error);
