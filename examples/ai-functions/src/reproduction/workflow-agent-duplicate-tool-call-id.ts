import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow';
import { ToolLoopAgent, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function finish(reason: 'stop' | 'tool-calls'): LanguageModelV4StreamPart {
  return {
    type: 'finish',
    finishReason: { unified: reason, raw: reason },
    usage,
  };
}

function scriptedModel(streams: LanguageModelV4StreamPart[][]) {
  const prompts: any[][] = [];
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      prompts.push(prompt);
      const parts = streams[Math.min(call++, streams.length - 1)];
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  });

  return { model, prompts };
}

function toolMessageOutputs(messages: any[]) {
  return messages
    .filter(message => message.role === 'tool')
    .flatMap(message => message.content)
    .map(part => part.output?.value);
}

function hasOwnResults(actual: unknown[]) {
  const expected = ['result for a', 'result for b'];
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function main() {
  const done: LanguageModelV4StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    finish('stop'),
  ];
  const parallel: LanguageModelV4StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    {
      type: 'tool-call',
      toolCallId: 'call_0',
      toolName: 'lookup',
      input: '{"q":"a"}',
    },
    {
      type: 'tool-call',
      toolCallId: 'call_0',
      toolName: 'lookup',
      input: '{"q":"b"}',
    },
    finish('tool-calls'),
  ];
  const executedInputs: string[] = [];
  const lookup = tool({
    inputSchema: z.object({ q: z.string() }),
    execute: async ({ q }) => {
      executedInputs.push(q);
      return `result for ${q}`;
    },
  });

  const toolLoop = scriptedModel([parallel, done]);
  const toolLoopResult = await new ToolLoopAgent({
    model: toolLoop.model,
    tools: { lookup },
  }).stream({ prompt: 'go' });
  for await (const _ of toolLoopResult.fullStream) {
    // Consume the lazy ToolLoopAgent stream.
  }
  const toolLoopOutputs = toolMessageOutputs(toolLoop.prompts[1]);
  if (!hasOwnResults(toolLoopOutputs)) {
    throw new Error(
      `ToolLoopAgent comparison did not preserve both results: ${JSON.stringify(toolLoopOutputs)}`,
    );
  }

  const workflow = scriptedModel([parallel, done]);
  const writtenParts: ModelCallStreamPart[] = [];
  const result = await new WorkflowAgent({
    model: workflow.model,
    tools: { lookup },
  }).stream({
    prompt: 'go',
    writable: new WritableStream<ModelCallStreamPart>({
      write(part) {
        writtenParts.push(part);
      },
    }),
  });

  const surfaces = {
    'next model prompt': toolMessageOutputs(workflow.prompts[1]),
    'steps[0].toolResults': result.steps[0]?.toolResults.map(
      part => part.output,
    ),
    'UI tool-result chunks': writtenParts
      .filter(part => part.type === 'tool-result')
      .map(part => part.output),
    'result.messages': toolMessageOutputs(result.messages),
  };

  console.log(JSON.stringify(surfaces, null, 2));
  if (JSON.stringify(executedInputs) !== JSON.stringify(['a', 'b', 'a', 'b'])) {
    throw new Error(
      `Expected both agents to execute both calls, received inputs ${JSON.stringify(executedInputs)}`,
    );
  }

  const mismatchedSurfaces = Object.entries(surfaces)
    .filter(([, outputs]) => !hasOwnResults(outputs))
    .map(([surface]) => surface);
  if (mismatchedSurfaces.length > 0) {
    throw new Error(
      `ISSUE_22377: WorkflowAgent duplicated the first tool result instead of preserving each call's output on: ${mismatchedSurfaces.join(', ')}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
