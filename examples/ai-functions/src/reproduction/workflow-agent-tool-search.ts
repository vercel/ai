import assert from 'node:assert/strict';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { stepCountIs, streamText, tool, toolSearch } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { z } from 'zod';

function makeModel() {
  let call = 0;
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };

  return new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      const parts =
        call === 1
          ? [
              {
                type: 'tool-call',
                toolCallId: 'c1',
                toolName: 'search',
                input: '{"query":"weather forecast"}',
              },
              {
                type: 'finish',
                finishReason: {
                  unified: 'tool-calls',
                  raw: 'tool_calls',
                },
                usage,
              },
            ]
          : [
              { type: 'text-start', id: 't' },
              { type: 'text-delta', id: 't', delta: 'done' },
              { type: 'text-end', id: 't' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage,
              },
            ];

      return {
        stream: simulateReadableStream({
          chunks: [{ type: 'stream-start', warnings: [] }, ...parts] as never,
        }),
      };
    },
  });
}

const tools = {
  search: toolSearch(),
  weather: tool({
    deferLoading: true,
    description: 'Get the weather forecast for a city.',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => ({
      city,
      forecast: 'Rain tomorrow.',
    }),
  }),
};

function toolsPerStep(model: MockLanguageModelV4) {
  return model.doStreamCalls.map(call =>
    (call.tools ?? []).map(tool => tool.name),
  );
}

async function main() {
  const streamTextModel = makeModel();
  const streamTextResult = streamText({
    model: streamTextModel,
    tools,
    stopWhen: stepCountIs(3),
    prompt: 'Will it rain?',
  });
  await streamTextResult.consumeStream();
  const streamTextSteps = await streamTextResult.steps;

  assert.deepEqual(toolsPerStep(streamTextModel), [
    ['search'],
    ['search', 'weather'],
  ]);
  assert.deepEqual(streamTextSteps[0]?.toolResults[0]?.output, {
    tools: [
      {
        name: 'weather',
        description: 'Get the weather forecast for a city.',
      },
    ],
  });

  const workflowModel = makeModel();
  const agent = new WorkflowAgent({
    model: workflowModel,
    tools,
    stopWhen: stepCountIs(3),
  });
  const workflowResult = await agent.stream({ prompt: 'Will it rain?' });
  const searchOutcome = workflowResult.steps[0]?.content.find(
    part => part.type === 'tool-result' || part.type === 'tool-error',
  );

  const actual = {
    toolsPerStep: toolsPerStep(workflowModel),
    searchOutcome:
      searchOutcome?.type === 'tool-result'
        ? {
            type: searchOutcome.type,
            output: searchOutcome.output,
          }
        : {
            type: searchOutcome?.type,
            error:
              searchOutcome?.error instanceof Error
                ? searchOutcome.error.message
                : String(searchOutcome?.error),
          },
  };
  const expected = {
    toolsPerStep: [['search'], ['search', 'weather']],
    searchOutcome: {
      type: 'tool-result',
      output: {
        tools: [
          {
            name: 'weather',
            description: 'Get the weather forecast for a city.',
          },
        ],
      },
    },
  };

  console.log(JSON.stringify({ actual, expected }, null, 2));
  assert.deepEqual(
    actual,
    expected,
    'ISSUE_21140: WorkflowAgent should hide deferred tools and bind toolSearch',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
