import {
  isStepCount,
  Output,
  simulateReadableStream,
  streamText,
  tool,
  ToolLoopAgent,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

type EntryPoint = 'streamText' | 'ToolLoopAgent.stream';
type OutputKind = 'object' | 'array';
type Scenario = 'preamble' | 'no-preamble' | 'single-step';

type CaseResult = {
  label: string;
  output: unknown;
  partials: unknown[];
  elements: unknown[];
  modelCalls: number;
  toolExecutions: number;
};

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

async function collect(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const values: unknown[] = [];
  for await (const value of stream) {
    values.push(value);
  }
  return values;
}

function includesValue(values: unknown[], expected: unknown): boolean {
  const serializedExpected = JSON.stringify(expected);
  return values.some(value => JSON.stringify(value) === serializedExpected);
}

function createSetup({
  outputKind,
  scenario,
  reuseTextId,
}: {
  outputKind: OutputKind;
  scenario: Scenario;
  reuseTextId: boolean;
}) {
  let modelCalls = 0;
  let toolExecutions = 0;

  const finalText =
    outputKind === 'object'
      ? '{"value":"done"}'
      : '{"elements":[{"value":"done"}]}';

  const finalStream = () =>
    simulateReadableStream({
      chunks: [
        { type: 'stream-start' as const, warnings: [] },
        { type: 'text-start' as const, id: 'answer' },
        {
          type: 'text-delta' as const,
          id: 'answer',
          delta: finalText,
        },
        { type: 'text-end' as const, id: 'answer' },
        {
          type: 'finish' as const,
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage,
        },
      ],
    });

  const model = new MockLanguageModelV4({
    doStream: async () => {
      modelCalls++;

      if (scenario === 'single-step' || modelCalls === 2) {
        return { stream: finalStream() };
      }

      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start' as const, warnings: [] },
            ...(scenario === 'preamble'
              ? [
                  {
                    type: 'text-start' as const,
                    id: reuseTextId ? 'answer' : 'intro',
                  },
                  {
                    type: 'text-delta' as const,
                    id: reuseTextId ? 'answer' : 'intro',
                    delta: 'Checking the value.',
                  },
                  {
                    type: 'text-end' as const,
                    id: reuseTextId ? 'answer' : 'intro',
                  },
                ]
              : []),
            {
              type: 'tool-call' as const,
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: '{}',
            },
            {
              type: 'finish' as const,
              finishReason: {
                unified: 'tool-calls' as const,
                raw: 'tool-calls',
              },
              usage,
            },
          ],
        }),
      };
    },
  });

  const tools = {
    lookup: tool({
      inputSchema: z.object({}),
      execute: async () => {
        toolExecutions++;
        return 'done';
      },
    }),
  };

  const output =
    outputKind === 'object'
      ? Output.object({ schema: z.object({ value: z.string() }) })
      : Output.array({ element: z.object({ value: z.string() }) });

  return {
    model,
    output,
    tools,
    getModelCalls: () => modelCalls,
    getToolExecutions: () => toolExecutions,
  };
}

async function runCase({
  entryPoint,
  outputKind,
  scenario,
  reuseTextId,
}: {
  entryPoint: EntryPoint;
  outputKind: OutputKind;
  scenario: Scenario;
  reuseTextId: boolean;
}): Promise<CaseResult> {
  const setup = createSetup({ outputKind, scenario, reuseTextId });
  const prompt = 'Look up the value and return it.';

  const result =
    entryPoint === 'streamText'
      ? streamText({
          model: setup.model,
          prompt,
          tools: setup.tools,
          output: setup.output,
          stopWhen: isStepCount(2),
        })
      : await new ToolLoopAgent({
          model: setup.model,
          tools: setup.tools,
          output: setup.output,
          stopWhen: isStepCount(2),
        }).stream({ prompt });

  const partialOutputStream = result.partialOutputStream;
  const elementStream =
    outputKind === 'array' ? result.elementStream : undefined;

  const [partials, elements, output] = await Promise.all([
    collect(partialOutputStream),
    elementStream == null ? [] : collect(elementStream),
    result.output,
  ]);

  return {
    label: [
      entryPoint,
      outputKind,
      scenario,
      scenario === 'preamble'
        ? reuseTextId
          ? 'reused-text-id'
          : 'different-text-id'
        : undefined,
    ]
      .filter(Boolean)
      .join(' / '),
    output,
    partials,
    elements,
    modelCalls: setup.getModelCalls(),
    toolExecutions: setup.getToolExecutions(),
  };
}

async function main() {
  const results: CaseResult[] = [];

  for (const entryPoint of ['streamText', 'ToolLoopAgent.stream'] as const) {
    for (const outputKind of ['object', 'array'] as const) {
      for (const reuseTextId of [false, true]) {
        results.push(
          await runCase({
            entryPoint,
            outputKind,
            scenario: 'preamble',
            reuseTextId,
          }),
        );
      }

      results.push(
        await runCase({
          entryPoint,
          outputKind,
          scenario: 'no-preamble',
          reuseTextId: false,
        }),
      );
      results.push(
        await runCase({
          entryPoint,
          outputKind,
          scenario: 'single-step',
          reuseTextId: false,
        }),
      );
    }
  }

  console.log(JSON.stringify(results, null, 2));

  const setupFailures: string[] = [];
  const streamFailures: string[] = [];

  for (const result of results) {
    const isArray = result.label.includes(' / array / ');
    const expectedOutput = isArray ? [{ value: 'done' }] : { value: 'done' };
    const isSingleStep = result.label.includes(' / single-step');
    const expectedModelCalls = isSingleStep ? 1 : 2;
    const expectedToolExecutions = isSingleStep ? 0 : 1;

    if (JSON.stringify(result.output) !== JSON.stringify(expectedOutput)) {
      setupFailures.push(`${result.label}: final output was invalid`);
    }
    if (result.modelCalls !== expectedModelCalls) {
      setupFailures.push(
        `${result.label}: expected ${expectedModelCalls} model calls, got ${result.modelCalls}`,
      );
    }
    if (result.toolExecutions !== expectedToolExecutions) {
      setupFailures.push(
        `${result.label}: expected ${expectedToolExecutions} tool executions, got ${result.toolExecutions}`,
      );
    }

    if (!includesValue(result.partials, expectedOutput)) {
      streamFailures.push(
        `${result.label}: partialOutputStream omitted output`,
      );
    }
    if (
      isArray &&
      !includesValue(result.elements, {
        value: 'done',
      })
    ) {
      streamFailures.push(`${result.label}: elementStream omitted element`);
    }
  }

  if (setupFailures.length > 0) {
    throw new Error(
      `Issue 20961 reproduction setup failed:\n${setupFailures.join('\n')}`,
    );
  }

  if (streamFailures.length > 0) {
    console.error(streamFailures.join('\n'));
    throw new Error(
      'ISSUE_20961: structured output streams omitted valid final output after earlier tool-step text',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
