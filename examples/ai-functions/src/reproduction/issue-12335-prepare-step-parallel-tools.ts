import type {
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { streamText, stepCountIs, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import assert from 'node:assert/strict';
import { z } from 'zod';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 0,
  },
};

function stream(
  parts: LanguageModelV3StreamPart[],
): LanguageModelV3StreamResult {
  return {
    stream: convertArrayToReadableStream([
      { type: 'stream-start', warnings: [] },
      ...parts,
    ]),
  };
}

function toolCall({
  id,
  name,
  input,
}: {
  id: string;
  name: string;
  input: string;
}): LanguageModelV3StreamPart {
  return {
    type: 'tool-call',
    toolCallId: id,
    toolName: name,
    input,
  };
}

function finish(
  finishReason: 'stop' | 'tool-calls',
): LanguageModelV3StreamPart {
  return {
    type: 'finish',
    finishReason: { unified: finishReason, raw: finishReason },
    usage,
  };
}

async function main() {
  let providerCallCount = 0;
  let summaryExecutionCount = 0;
  const prepareStepNumbers: number[] = [];
  const observedToolChoices: unknown[] = [];

  const model = new MockLanguageModelV3({
    provider: 'google-vertex',
    modelId: 'gemini-3-flash-preview',
    doStream: async options => {
      observedToolChoices.push(options.toolChoice);

      const call = providerCallCount++;
      if (call > 8) {
        throw new Error(
          'Reproduced issue #12335: forced stepSummary tool call repeated without advancing to the next normal step.',
        );
      }

      if (options.toolChoice?.type === 'tool') {
        assert.equal(options.toolChoice.toolName, 'stepSummary');

        return stream([
          toolCall({
            id: `summary-${call}`,
            name: 'stepSummary',
            input: '{"summary":"Work completed; continue normally."}',
          }),
          finish('tool-calls'),
        ]);
      }

      switch (call) {
        case 0:
          return stream([
            toolCall({
              id: 'weather-1',
              name: 'getWeather',
              input: '{"city":"San Francisco"}',
            }),
            toolCall({
              id: 'population-1',
              name: 'getPopulation',
              input: '{"city":"San Francisco"}',
            }),
            toolCall({
              id: 'timezone-1',
              name: 'getTimezone',
              input: '{"city":"San Francisco"}',
            }),
            finish('tool-calls'),
          ]);
        case 1:
          return stream([
            toolCall({
              id: 'weather-2',
              name: 'getWeather',
              input: '{"city":"Tokyo"}',
            }),
            finish('tool-calls'),
          ]);
        case 3:
          return stream([
            { type: 'text-start', id: 'final' },
            {
              type: 'text-delta',
              id: 'final',
              delta: 'All requested work is complete.',
            },
            { type: 'text-end', id: 'final' },
            finish('stop'),
          ]);
        default:
          throw new Error(
            `Unexpected unforced provider call ${call}; prepareStep did not force step 2.`,
          );
      }
    },
  });

  const cityInputSchema = z.object({ city: z.string() });

  const result = streamText({
    model,
    prompt: 'Gather city information and then finish the task.',
    tools: {
      getWeather: tool({
        inputSchema: cityInputSchema,
        execute: async ({ city }) => ({ city, weather: 'sunny' }),
      }),
      getPopulation: tool({
        inputSchema: cityInputSchema,
        execute: async ({ city }) => ({ city, population: 1_000_000 }),
      }),
      getTimezone: tool({
        inputSchema: cityInputSchema,
        execute: async ({ city }) => ({ city, timezone: 'UTC' }),
      }),
      stepSummary: tool({
        inputSchema: z.object({ summary: z.string() }),
        execute: async ({ summary }) => {
          summaryExecutionCount++;
          return { summary, status: 'complete' };
        },
      }),
    },
    stopWhen: stepCountIs(20),
    prepareStep: async ({ stepNumber }) => {
      prepareStepNumbers.push(stepNumber);

      if (stepNumber > 0 && (stepNumber + 1) % 3 === 0) {
        return {
          toolChoice: {
            type: 'tool',
            toolName: 'stepSummary',
          },
        };
      }
    },
  });

  const [steps, text] = await Promise.all([result.steps, result.text]);

  if (summaryExecutionCount > 1) {
    throw new Error(
      'Reproduced issue #12335: forced stepSummary tool call repeated without advancing to the next normal step.',
    );
  }

  assert.equal(summaryExecutionCount, 1);
  assert.deepEqual(prepareStepNumbers, [0, 1, 2, 3]);
  assert.equal(providerCallCount, 4);
  assert.equal(steps.length, 4);
  assert.equal(text, 'All requested work is complete.');
  assert.deepEqual(
    observedToolChoices.map(choice =>
      choice != null &&
      typeof choice === 'object' &&
      'type' in choice &&
      choice.type === 'tool'
        ? choice
        : { type: 'auto' },
    ),
    [
      { type: 'auto' },
      { type: 'auto' },
      { type: 'tool', toolName: 'stepSummary' },
      { type: 'auto' },
    ],
  );

  console.log(
    JSON.stringify(
      {
        providerCallCount,
        prepareStepNumbers,
        summaryExecutionCount,
        stepToolNames: steps.map(step =>
          step.toolCalls.map(toolCall => toolCall.toolName),
        ),
        text,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
