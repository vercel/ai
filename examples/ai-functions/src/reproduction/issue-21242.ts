import assert from 'node:assert/strict';
import { experimental_toolCaller, generateText, streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: undefined,
    reasoning: undefined,
  },
};

function createGovernedTools(onGovernedExecution: () => void) {
  const codeMode = experimental_toolCaller(
    tool({
      inputSchema: z.object({}),
      execute: async (): Promise<unknown> => {
        throw new Error('The unbound caller must not execute.');
      },
    }),
    {
      type: 'local',
      bind: governedTools =>
        tool({
          inputSchema: z.object({}),
          execute: async () => Object.keys(governedTools),
        }),
    },
  );

  return {
    code_mode: codeMode,
    governed_tool: tool({
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }) => {
        onGovernedExecution();
        return { value };
      },
    }),
  };
}

async function main() {
  let generateExecutions = 0;
  let streamExecutions = 0;
  let generateModelToolNames: string[] | undefined;
  let streamModelToolNames: string[] | undefined;

  await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async options => {
        generateModelToolNames = options.tools?.map(tool => tool.name);
        return {
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage,
          warnings: [],
          content: [
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'generate-call',
              toolName: 'governed_tool',
              input: '{"value":"generate"}',
            },
          ],
        };
      },
    }),
    tools: createGovernedTools(() => {
      generateExecutions++;
    }),
    experimental_toolCallers: {
      governed_tool: ['code_mode'],
    },
    prompt: 'Use the governed tool.',
  });

  const streamResult = streamText({
    model: new MockLanguageModelV4({
      doStream: async options => {
        streamModelToolNames = options.tools?.map(tool => tool.name);
        return {
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'stream-call',
              toolName: 'governed_tool',
              input: '{"value":"stream"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
              usage,
            },
          ]),
        };
      },
    }),
    tools: createGovernedTools(() => {
      streamExecutions++;
    }),
    experimental_toolCallers: {
      governed_tool: ['code_mode'],
    },
    prompt: 'Use the governed tool.',
  });

  await streamResult.consumeStream();

  assert.deepEqual(generateModelToolNames, ['code_mode']);
  assert.deepEqual(streamModelToolNames, ['code_mode']);
  assert.equal(streamExecutions, 0);

  console.log(
    JSON.stringify({
      generateExecutions,
      streamExecutions,
      generateModelToolNames,
      streamModelToolNames,
    }),
  );

  assert.equal(
    generateExecutions,
    0,
    'ISSUE_21242: generateText executed a caller-governed tool emitted as a direct model call',
  );
}

main();
