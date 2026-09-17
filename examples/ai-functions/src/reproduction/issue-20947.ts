import assert from 'node:assert/strict';
import {
  generateText,
  simulateReadableStream,
  streamText,
  tool,
  ToolLoopAgent,
  type ToolCallRepairFunction,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function createModel(input: string) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'echo',
          input,
        },
      ],
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
      usage,
      warnings: [],
    },
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'tool-input-start', id: 'call-1', toolName: 'echo' },
          { type: 'tool-input-delta', id: 'call-1', delta: input },
          { type: 'tool-input-end', id: 'call-1' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'echo',
            input,
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
            usage,
          },
        ],
      }),
    }),
  });
}

function createTools(callbackInputs: unknown[]) {
  return {
    echo: tool({
      inputSchema: z.object({ value: z.string() }),
      onInputAvailable: ({ input }) => {
        callbackInputs.push(input);
        input.value.toUpperCase();
      },
      execute: async ({ value }) => value,
    }),
  };
}

type StreamObservation = {
  callbackInputs: unknown[];
  partTypes: string[];
  thrownMessage: string | undefined;
};

async function observeStream({
  input,
  repair,
  agent,
}: {
  input: string;
  repair?: 'null' | 'valid';
  agent?: boolean;
}): Promise<StreamObservation> {
  const callbackInputs: unknown[] = [];
  const tools = createTools(callbackInputs);
  const repairToolCall:
    | ToolCallRepairFunction<ReturnType<typeof createTools>>
    | undefined =
    repair === 'null'
      ? async () => null
      : repair === 'valid'
        ? async ({ toolCall }) => ({
            ...toolCall,
            input: '{"value":"repaired"}',
          })
        : undefined;

  const result = agent
    ? await new ToolLoopAgent({
        model: createModel(input),
        tools,
        repairToolCall,
      }).stream({ prompt: 'Echo a value.' })
    : streamText({
        model: createModel(input),
        tools,
        prompt: 'Echo a value.',
        repairToolCall,
        onError: () => {},
      });

  const partTypes: string[] = [];
  let thrownMessage: string | undefined;

  try {
    for await (const part of result.fullStream) {
      partTypes.push(part.type);
    }
  } catch (error) {
    thrownMessage = error instanceof Error ? error.message : String(error);
  }

  return { callbackInputs, partTypes, thrownMessage };
}

async function main() {
  const generateCallbackInputs: unknown[] = [];
  const generated = await generateText({
    model: createModel('{"value":42}'),
    tools: createTools(generateCallbackInputs),
    prompt: 'Echo a value.',
  });

  assert.equal(
    generated.toolCalls[0]?.invalid,
    true,
    'generateText must identify the schema-invalid tool call',
  );
  assert.equal(
    generateCallbackInputs.length,
    0,
    'generateText must skip onInputAvailable for invalid input',
  );
  assert.equal(
    generated.steps[0]?.content.some(part => part.type === 'tool-error'),
    true,
    'generateText must retain the invalid call as a tool error',
  );

  const schemaInvalid = await observeStream({ input: '{"value":42}' });
  const malformedJson = await observeStream({ input: '{"value":' });
  const repairReturnedNull = await observeStream({
    input: '{"value":42}',
    repair: 'null',
  });
  const agentSchemaInvalid = await observeStream({
    input: '{"value":42}',
    agent: true,
  });
  const valid = await observeStream({ input: '{"value":"valid"}' });
  const successfullyRepaired = await observeStream({
    input: '{"value":42}',
    repair: 'valid',
  });

  const invalidObservations = [
    ['schema-invalid input', schemaInvalid],
    ['malformed JSON', malformedJson],
    ['repair returning null', repairReturnedNull],
    ['ToolLoopAgent.stream schema-invalid input', agentSchemaInvalid],
  ] as const;

  for (const [name, observation] of invalidObservations) {
    assert.ok(
      observation.partTypes.includes('tool-input-start') &&
        observation.partTypes.includes('tool-input-delta'),
      `${name} must retain streamed tool-input lifecycle events`,
    );
  }

  assert.deepEqual(valid.callbackInputs, [{ value: 'valid' }]);
  assert.equal(valid.thrownMessage, undefined);
  assert.ok(valid.partTypes.includes('tool-result'));

  assert.deepEqual(successfullyRepaired.callbackInputs, [
    { value: 'repaired' },
  ]);
  assert.equal(successfullyRepaired.thrownMessage, undefined);
  assert.ok(successfullyRepaired.partTypes.includes('tool-result'));

  const invalidBehaviorViolations = invalidObservations.filter(
    ([, observation]) =>
      observation.callbackInputs.length !== 0 ||
      observation.thrownMessage !== undefined ||
      !observation.partTypes.includes('tool-error'),
  );

  if (invalidBehaviorViolations.length === 0) {
    return;
  }

  assert.ok(
    invalidBehaviorViolations.every(
      ([, observation]) =>
        observation.callbackInputs.length === 1 &&
        observation.thrownMessage?.includes('toUpperCase') &&
        !observation.partTypes.includes('tool-error'),
    ),
    'Unexpected streaming behavior differed from issue #20947',
  );

  throw new Error(
    'ISSUE #20947 REPRODUCED: schema-invalid tool input reached onInputAvailable and terminated streaming',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
