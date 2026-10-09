import { WorkflowAgent } from '@ai-sdk/workflow';
import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { ToolLoopAgent } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const expectedText = 'A partial answer.';
const expectedReasoning = 'Thinking.';
const expectedAssistantContent = {
  text: expectedText,
  reasoning: expectedReasoning,
};

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

type Scenario =
  | 'stop'
  | 'length'
  | 'content-filter'
  | 'error'
  | 'error-part'
  | 'other'
  | 'unknown'
  | 'none';

function createModel(scenario: Scenario) {
  const terminalError = new Error('upstream error');
  const unifiedFinishReason =
    scenario === 'error-part'
      ? 'error'
      : scenario === 'none'
        ? 'other'
        : scenario;
  const streamParts: LanguageModelV4StreamPart[] = [
    { type: 'stream-start' as const, warnings: [] },
    { type: 'reasoning-start' as const, id: 'r1' },
    {
      type: 'reasoning-delta' as const,
      id: 'r1',
      delta: expectedReasoning,
    },
    { type: 'reasoning-end' as const, id: 'r1' },
    { type: 'text-start' as const, id: 't1' },
    { type: 'text-delta' as const, id: 't1', delta: expectedText },
    { type: 'text-end' as const, id: 't1' },
    ...(scenario === 'error-part'
      ? [{ type: 'error' as const, error: terminalError }]
      : []),
    ...(scenario === 'none'
      ? []
      : ([
          {
            type: 'finish',
            finishReason: {
              unified: unifiedFinishReason,
              raw: scenario,
            },
            usage,
          },
        ] as unknown as LanguageModelV4StreamPart[])),
  ];

  return {
    terminalError,
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            for (const part of streamParts) {
              controller.enqueue(part);
            }
            controller.close();
          },
        }),
      }),
      doGenerate: async () =>
        ({
          content: [
            { type: 'reasoning' as const, text: expectedReasoning },
            { type: 'text' as const, text: expectedText },
          ],
          finishReason: {
            unified: unifiedFinishReason,
            raw: scenario,
          },
          usage,
          warnings: [],
        }) as unknown as LanguageModelV4GenerateResult,
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

function assistantContent(messages: readonly unknown[]) {
  const assistantMessage = [...messages]
    .reverse()
    .find(
      message =>
        isRecord(message) && 'role' in message && message.role === 'assistant',
    );

  if (!isRecord(assistantMessage) || !Array.isArray(assistantMessage.content)) {
    return { text: null, reasoning: null };
  }

  let text = '';
  let reasoning = '';
  for (const part of assistantMessage.content) {
    if (!isRecord(part) || typeof part.text !== 'string') {
      continue;
    }
    if (part.type === 'text') {
      text += part.text;
    } else if (part.type === 'reasoning') {
      reasoning += part.text;
    }
  }

  return {
    text: text || null,
    reasoning: reasoning || null,
  };
}

function streamedDelta(parts: readonly unknown[], type: string) {
  let text = '';
  for (const part of parts) {
    if (isRecord(part) && part.type === type && typeof part.text === 'string') {
      text += part.text;
    }
  }
  return text;
}

function assertExpectedAssistantContent(
  value: ReturnType<typeof assistantContent>,
  label: string,
) {
  if (
    value.text !== expectedAssistantContent.text ||
    value.reasoning !== expectedAssistantContent.reasoning
  ) {
    throw new Error(`${label} did not retain the expected assistant content`);
  }
}

async function main() {
  const affected: Array<{ scenario: Scenario; missingFrom: string[] }> = [];

  for (const scenario of [
    'stop',
    'length',
    'content-filter',
    'error',
    'error-part',
    'other',
    'unknown',
    'none',
  ] as const) {
    const controlModel = createModel(scenario).model;
    const controlOptions = {
      prompt: 'Answer.',
      onError: () => {},
    };
    const control = await new ToolLoopAgent({ model: controlModel }).stream(
      controlOptions,
    );
    for await (const _ of control.fullStream) {
      // Drain the stream so response.messages is final.
    }
    assertExpectedAssistantContent(
      assistantContent((await control.response).messages),
      `ToolLoopAgent.stream (${scenario})`,
    );

    const generated = await new WorkflowAgent({
      model: createModel(scenario).model,
    }).generate({ prompt: 'Answer.' });
    assertExpectedAssistantContent(
      assistantContent(generated.responseMessages),
      `WorkflowAgent.generate (${scenario})`,
    );

    const streamedParts: unknown[] = [];
    let onEndMessages: readonly unknown[] | undefined;
    const { model, terminalError } = createModel(scenario);
    const streamed = await new WorkflowAgent({ model }).stream({
      prompt: 'Answer.',
      writable: new WritableStream({
        write(part) {
          streamedParts.push(part);
        },
      }),
      onError: () => {},
      onEnd(event) {
        onEndMessages = event.messages;
      },
    });

    const finalStep = streamed.steps.at(-1);
    if (
      finalStep?.text !== expectedText ||
      finalStep.reasoningText !== expectedReasoning ||
      streamedDelta(streamedParts, 'text-delta') !== expectedText ||
      streamedDelta(streamedParts, 'reasoning-delta') !== expectedReasoning
    ) {
      throw new Error(
        `WorkflowAgent.stream (${scenario}) did not produce the expected streamed round: ${JSON.stringify(
          {
            stepText: finalStep?.text,
            stepReasoning: finalStep?.reasoningText,
            streamedParts,
          },
        )}`,
      );
    }
    if (onEndMessages == null) {
      throw new Error(`WorkflowAgent.stream (${scenario}) did not call onEnd`);
    }
    if (
      (scenario === 'error-part' &&
        (!('error' in streamed) || streamed.error !== terminalError)) ||
      (scenario !== 'error-part' && 'error' in streamed)
    ) {
      throw new Error(
        `WorkflowAgent.stream (${scenario}) changed the result.error contract`,
      );
    }

    const projections = {
      messages: assistantContent(streamed.messages),
      'step.response.messages': assistantContent(finalStep.response.messages),
      'onEnd messages': assistantContent(onEndMessages),
    };
    const missingFrom = Object.entries(projections)
      .filter(
        ([, value]) =>
          value.text !== expectedAssistantContent.text ||
          value.reasoning !== expectedAssistantContent.reasoning,
      )
      .map(([label]) => label);

    console.log(
      JSON.stringify({
        scenario,
        finishReason: streamed.finishReason,
        stepText: finalStep.text,
        stepReasoning: finalStep.reasoningText,
        hasError: 'error' in streamed,
        projections,
      }),
    );

    if (missingFrom.length > 0) {
      affected.push({ scenario, missingFrom });
    }
  }

  if (affected.length > 0) {
    console.error(
      `BUG #22376: WorkflowAgent.stream() omitted streamed assistant content from terminal round messages: ${affected
        .map(
          ({ scenario, missingFrom }) =>
            `${scenario} [${missingFrom.join(', ')}]`,
        )
        .join('; ')}`,
    );
    process.exitCode = 1;
  }
}

await main();
