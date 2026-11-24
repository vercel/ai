import {
  anthropic,
  createAnthropic,
  forwardAnthropicContainerIdFromLastStep,
} from '@ai-sdk/anthropic';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

/**
 * Reproduction for https://github.com/vercel/ai/issues/25384
 *
 * Anthropic programmatic tool calling (code_execution_20260120 + a custom tool
 * with allowedCallers) through AI Gateway. Expected: step 1 returns three
 * get_price calls from the code execution container, step 2 continues in the
 * same container and returns the total.
 *
 * Reported failures:
 * - tool calls have no `caller` and the response has no `container`
 * - a continuation either re-runs the program in a new container (the same
 *   three calls again with 0 usage) or fails with
 *   `tools.0.custom.allowed_callers: Extra inputs are not permitted`
 *
 * Usage:
 *   # AI SDK gateway provider (/v4/ai)
 *   pnpm tsx src/generate-text/gateway/anthropic-programmatic-tool-calling.ts
 *
 *   # @ai-sdk/anthropic against the gateway's Anthropic-compatible /v1/messages
 *   pnpm tsx src/generate-text/gateway/anthropic-programmatic-tool-calling.ts messages
 *
 * Requires AI_GATEWAY_API_KEY. For `messages`, AI_GATEWAY_ANTHROPIC_BASE_URL
 * overrides the base URL (default https://ai-gateway.vercel.sh/v1).
 */

const via = process.argv[2] === 'messages' ? 'messages' : 'gateway';

const model =
  via === 'messages'
    ? createAnthropic({
        apiKey: process.env.AI_GATEWAY_API_KEY,
        baseURL:
          process.env.AI_GATEWAY_ANTHROPIC_BASE_URL ??
          'https://ai-gateway.vercel.sh/v1',
      })('anthropic/claude-opus-5.5')
    : 'anthropic/claude-opus-5.5';

const prices: Record<string, number> = { A: 3, B: 5, C: 7 };

run(async () => {
  console.log(`via: ${via}\n`);

  const result = await generateText({
    model,
    maxOutputTokens: 2048,
    // needed to log the container sent on each step
    include: { requestBody: true },
    stopWhen: isStepCount(5),
    prompt:
      'Write code that calls get_price for A, B and C and adds them up. Reply with only the total.',
    tools: {
      code_execution: anthropic.tools.codeExecution_20260120(),
      get_price: tool({
        description: 'Price of one item by name.',
        inputSchema: z.object({ item: z.string() }),
        execute: async ({ item }) => prices[item] ?? 0,
        providerOptions: {
          anthropic: { allowedCallers: ['code_execution_20260120'] },
        },
      }),
    },
    prepareStep: forwardAnthropicContainerIdFromLastStep,
    onStepFinish: ({
      stepNumber,
      request,
      toolCalls,
      usage,
      providerMetadata,
      finishReason,
    }) => {
      const requestBody =
        typeof request.body === 'string'
          ? JSON.parse(request.body)
          : request.body;

      console.log(`--- step ${stepNumber} ---`);
      console.log('finishReason:', finishReason);
      console.log(
        'request container:',
        JSON.stringify(
          requestBody?.container ??
            requestBody?.providerOptions?.anthropic?.container ??
            null,
        ),
      );
      console.log(
        'response container:',
        JSON.stringify(providerMetadata?.anthropic?.container ?? null),
      );
      console.log(
        'usage:',
        usage.inputTokens,
        'in /',
        usage.outputTokens,
        'out',
      );
      for (const call of toolCalls) {
        console.log(
          `tool call: ${call.toolName}(${JSON.stringify(call.input)}) caller=${JSON.stringify(
            call.providerMetadata?.anthropic?.caller ?? null,
          )}`,
        );
      }
      console.log();
    },
  });

  // The program may request prices across several steps (A, then B, ...);
  // a re-run is a later step requesting an item an earlier step answered.
  const answered = new Set<string>();
  const repeated: string[] = [];
  for (const step of result.steps) {
    const items = step.toolCalls
      .filter(call => call.toolName === 'get_price')
      .map(call => (call.input as { item: string }).item);
    repeated.push(...items.filter(item => answered.has(item)));
    for (const item of items) answered.add(item);
  }

  console.log('text:', JSON.stringify(result.text));
  console.log('steps:', result.steps.length);

  if (repeated.length > 0) {
    console.log(
      `\nREPRODUCED: get_price re-requested ${repeated.join(', ')}; the container was not continued.`,
    );
  } else if (result.text.includes('15')) {
    console.log(
      '\nOK: programmatic tool calling continued to the final answer.',
    );
  }
});
