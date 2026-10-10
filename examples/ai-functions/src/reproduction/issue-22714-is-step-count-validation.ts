import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import {
  generateText,
  isStepCount,
  jsonSchema,
  stepCountIs,
  tool,
  type StopCondition,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const invalidLimits = [
  { label: '0', value: 0 },
  { label: '-1', value: -1 },
  { label: '1.5', value: 1.5 },
  { label: 'NaN', value: NaN },
  { label: 'Infinity', value: Infinity },
  { label: '-Infinity', value: -Infinity },
  {
    label: 'Number.MAX_SAFE_INTEGER + 1',
    value: Number.MAX_SAFE_INTEGER + 1,
  },
];

const factories: Array<{
  name: string;
  create: (limit: number) => StopCondition<any, any>;
}> = [
  { name: 'isStepCount', create: isStepCount },
  { name: 'stepCountIs', create: stepCountIs },
];

type Outcome = {
  calls: number;
  errorName: string | undefined;
};

class ReproducedBugError extends Error {}

async function run(
  createStopCondition: (limit: number) => StopCondition<any, any>,
  limit: number,
): Promise<Outcome> {
  let calls = 0;
  let errorName: string | undefined;

  const model = new MockLanguageModelV4({
    doGenerate: async (): Promise<LanguageModelV4GenerateResult> => {
      const stop = ++calls === 4;

      return {
        content: stop
          ? [{ type: 'text', text: 'done' }]
          : [
              {
                type: 'tool-call',
                toolCallId: `call-${calls}`,
                toolName: 'task',
                input: '{}',
              },
            ],
        warnings: [],
        finishReason: {
          unified: stop ? 'stop' : 'tool-calls',
          raw: stop ? 'stop' : 'tool-calls',
        },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 1,
            text: 1,
            reasoning: undefined,
          },
        },
      };
    },
  });

  try {
    await generateText({
      model,
      prompt: 'Run the task.',
      stopWhen: createStopCondition(limit),
      tools: {
        task: tool({
          inputSchema: jsonSchema({
            type: 'object',
            properties: {},
            additionalProperties: false,
          }),
          execute: async () => 'ok',
        }),
      },
    });
  } catch (error) {
    errorName = error instanceof Error ? error.name : typeof error;
  }

  return { calls, errorName };
}

async function main() {
  const failures: string[] = [];

  for (const factory of factories) {
    const validOutcome = await run(factory.create, 1);
    if (validOutcome.calls !== 1 || validOutcome.errorName !== undefined) {
      throw new Error(
        `${factory.name}(1) unexpectedly produced ${JSON.stringify(validOutcome)}`,
      );
    }

    for (const limit of invalidLimits) {
      const outcome = await run(factory.create, limit.value);

      if (
        outcome.calls === 0 &&
        outcome.errorName === 'AI_InvalidArgumentError'
      ) {
        continue;
      }

      if (outcome.calls === 4 && outcome.errorName === undefined) {
        failures.push(
          `${factory.name}(${limit.label}) made four model calls without throwing`,
        );
        continue;
      }

      throw new Error(
        `${factory.name}(${limit.label}) unexpectedly produced ${JSON.stringify(outcome)}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new ReproducedBugError(
      `ISSUE_22714_REPRODUCED: invalid step limits reached the model instead of throwing AI_InvalidArgumentError before the first call\n${failures.join('\n')}`,
    );
  }

  console.log(
    'All invalid isStepCount limits were rejected before any model call.',
  );
}

main();
