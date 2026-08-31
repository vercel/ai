import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow';
import { ToolLoopAgent, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const usage = {
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
};

function createLoopingModel() {
  let modelCalls = 0;

  return {
    get modelCalls() {
      return modelCalls;
    },
    model: new MockLanguageModelV4({
      doStream: async () => {
        modelCalls++;

        const parts: LanguageModelV4StreamPart[] =
          modelCalls < 25
            ? [
                {
                  type: 'tool-call',
                  toolCallId: `call-${modelCalls}`,
                  toolName: 'continueLoop',
                  input: '{}',
                },
                {
                  type: 'finish',
                  finishReason: {
                    unified: 'tool-calls',
                    raw: 'tool-calls',
                  },
                  usage,
                },
              ]
            : [
                { type: 'text-start', id: 'text-1' },
                {
                  type: 'text-delta',
                  id: 'text-1',
                  delta: 'done',
                },
                { type: 'text-end', id: 'text-1' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage,
                },
              ];

        return { stream: convertArrayToReadableStream(parts) };
      },
    }),
  };
}

const tools = {
  continueLoop: tool({
    inputSchema: z.object({}),
    execute: async () => 'continue',
  }),
};

async function main() {
  const toolLoopModel = createLoopingModel();
  const toolLoopAgent = new ToolLoopAgent({
    model: toolLoopModel.model,
    tools,
  });
  const toolLoopResult = await toolLoopAgent.stream({ prompt: 'continue' });
  await toolLoopResult.consumeStream();

  if (toolLoopModel.modelCalls !== 20) {
    throw new Error(
      `ToolLoopAgent baseline did not stop at 20 model calls: ${toolLoopModel.modelCalls}`,
    );
  }

  const workflowModel = createLoopingModel();
  const workflowAgent = new WorkflowAgent({
    model: workflowModel.model,
    tools,
  });
  await workflowAgent.stream({
    messages: [{ role: 'user', content: 'continue' }],
    writable: new WritableStream<ModelCallStreamPart>(),
  });

  console.log(
    JSON.stringify({
      'ToolLoopAgent modelCalls': toolLoopModel.modelCalls,
      'WorkflowAgent modelCalls': workflowModel.modelCalls,
    }),
  );

  if (workflowModel.modelCalls !== 20) {
    throw new Error(
      `ISSUE #20069 REPRODUCED: WorkflowAgent made ${workflowModel.modelCalls} model calls without stopWhen; expected the default limit of 20`,
    );
  }
}

await main();
