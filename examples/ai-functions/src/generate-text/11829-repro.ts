import { generateText, streamText, tool } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { stepCountIs } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const deferredTools = {
    arithmetic_addition: tool({
      description: 'Add two numbers together',
      inputSchema: z.object({
        element_a: z.number().describe('First operand'),
        element_b: z.number().describe('Second operand'),
      }),
      execute: async ({ element_a, element_b }) => ({
        result: element_a + element_b,
      }),
      providerOptions: {
        anthropic: { deferLoading: true },
      },
    }),
    arithmetic_subtraction: tool({
      description: 'Subtract second number from first',
      inputSchema: z.object({
        minuend_x: z.number().describe('Number to subtract from'),
        subtrahend_y: z.number().describe('Number to subtract'),
      }),
      execute: async ({ minuend_x, subtrahend_y }) => ({
        result: minuend_x - subtrahend_y,
      }),
      providerOptions: {
        anthropic: { deferLoading: true },
      },
    }),
    arithmetic_multiplication: tool({
      description: 'Multiply two numbers',
      inputSchema: z.object({
        factor_alpha: z.number().describe('First factor'),
        factor_beta: z.number().describe('Second factor'),
      }),
      execute: async ({ factor_alpha, factor_beta }) => ({
        result: factor_alpha * factor_beta,
      }),
      providerOptions: {
        anthropic: { deferLoading: true },
      },
    }),
  };

  const searchTools = tool({
    description: `Load tools before using them. Query format: "select:tool_name" (one tool per call).
                  Available tools: ${Object.keys(deferredTools).join(', ')}
                  Example: query "select:arithmetic_addition" to load arithmetic_addition.`,
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      if (query.startsWith('select:')) {
        const name = query.slice(7).trim();
        if (name in deferredTools) {
          return [name];
        }
      }
      return [];
    },
    toModelOutput: ({ output }) => ({
      type: 'content',
      value: (output as string[]).map(toolName => ({
        type: 'tool-reference' as const,
        toolName,
      })),
    }),
  });

  const allTools = { searchTools, ...deferredTools };

  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    headers: {
      'anthropic-beta': 'advanced-tool-use-2025-11-20',
    },
  });

  console.log('=== Tool Search POC ===\n');

  const toolList = Object.entries(deferredTools)
    .map(([name, t]) => `- ${name}: ${(t as any).description}`)
    .join('\n');

  const result = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    tools: allTools,
    system: `You have access to deferred tools. Use searchTools to load them before use.
            Available tools (must search before using):
            ${toolList}`,

    prompt: 'What is 15 + 27? Then subtract 10 from that.',
    stopWhen: stepCountIs(10),
  });

  console.log(`\nFinal: ${result.text}`);
  console.log('\n=== Messages ===\n');
  console.log(JSON.stringify(result.response.messages, null, 2));
});
