import assert from 'node:assert/strict';
import {
  generateText,
  simulateReadableStream,
  stepCountIs,
  streamText,
  tool,
  ToolLoopAgent,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod/v4';

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

function createModel(input: string) {
  return new MockLanguageModelV3({
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
        initialDelayInMs: null,
        chunkDelayInMs: null,
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

async function collectStream({
  input,
  repair,
}: {
  input: string;
  repair?: boolean | 'null';
}) {
  const callbackInputs: unknown[] = [];
  const parts: Array<{ type: string; [key: string]: unknown }> = [];
  let thrown: unknown;

  const result = streamText({
    model: createModel(input),
    tools: createTools(callbackInputs),
    prompt: 'Echo a value.',
    onError: () => {},
    experimental_repairToolCall:
      repair == null
        ? undefined
        : async ({ toolCall }) =>
            repair === 'null'
              ? null
              : {
                  ...toolCall,
                  input: '{"value":"repaired"}',
                },
  });

  try {
    for await (const part of result.fullStream) {
      parts.push(part);
    }
  } catch (error) {
    thrown = error;
  }

  return { callbackInputs, parts, thrown };
}

function assertInvalidStream(
  result: Awaited<ReturnType<typeof collectStream>>,
) {
  assert.equal(
    result.callbackInputs.length,
    0,
    'schema-invalid input reached onInputAvailable',
  );
  assert.equal(result.thrown, undefined, 'the invalid tool call threw');
  assert.ok(
    result.parts.some(part => part.type === 'tool-input-start'),
    'tool-input-start was not retained',
  );
  assert.ok(
    result.parts.some(part => part.type === 'tool-input-delta'),
    'tool-input-delta was not retained',
  );
  assert.ok(
    result.parts.some(part => part.type === 'tool-error'),
    'the invalid tool call did not retain its tool-error',
  );
}

async function main() {
  const generateCallbackInputs: unknown[] = [];
  const generated = await generateText({
    model: createModel('{"value":42}'),
    tools: createTools(generateCallbackInputs),
    prompt: 'Echo a value.',
  });

  assert.equal(
    generateCallbackInputs.length,
    0,
    'generateText passed invalid input to onInputAvailable',
  );
  assert.equal(generated.toolCalls[0]?.invalid, true);
  assert.ok(generated.content.some(part => part.type === 'tool-error'));

  assertInvalidStream(await collectStream({ input: '{"value":42}' }));
  assertInvalidStream(await collectStream({ input: '{"value":' }));
  assertInvalidStream(
    await collectStream({ input: '{"value":42}', repair: 'null' }),
  );

  const valid = await collectStream({ input: '{"value":"valid"}' });
  assert.deepEqual(valid.callbackInputs, [{ value: 'valid' }]);
  assert.equal(valid.thrown, undefined);
  assert.equal(
    valid.parts.some(part => part.type === 'tool-error'),
    false,
  );

  const repaired = await collectStream({
    input: '{"value":42}',
    repair: true,
  });
  assert.deepEqual(repaired.callbackInputs, [{ value: 'repaired' }]);
  assert.equal(repaired.thrown, undefined);
  assert.equal(
    repaired.parts.some(part => part.type === 'tool-error'),
    false,
  );

  const agentCallbackInputs: unknown[] = [];
  const agent = new ToolLoopAgent({
    model: createModel('{"value":42}'),
    tools: createTools(agentCallbackInputs),
    stopWhen: stepCountIs(1),
  });
  const agentResult = await agent.stream({ prompt: 'Echo a value.' });
  const agentPartTypes: string[] = [];

  for await (const part of agentResult.fullStream) {
    agentPartTypes.push(part.type);
  }

  assert.equal(
    agentCallbackInputs.length,
    0,
    'ToolLoopAgent.stream passed invalid input to onInputAvailable',
  );
  assert.ok(agentPartTypes.includes('tool-error'));

  console.log(
    'issue #20947 could not be reproduced: invalid streamed tool inputs skipped onInputAvailable and retained tool-error recovery',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
