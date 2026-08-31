import { WorkflowAgent } from '@ai-sdk/workflow';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';

const failureSignal =
  'ISSUE_20074: WorkflowAgent.generate() is public but throws "Not implemented"';

async function main() {
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
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'reply' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'reply' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  });
  const agent = new WorkflowAgent({ model });
  const generate = (
    agent as unknown as {
      generate?: (options: { prompt: string }) => unknown;
    }
  ).generate;

  // Hiding the unsupported method is one valid resolution described by the
  // issue. If it remains public, it must provide a usable non-streaming result.
  if (generate == null) {
    return;
  }

  let result: unknown;
  try {
    result = await generate.call(agent, { prompt: 'Hello' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Not implemented') {
      throw new Error(failureSignal);
    }
    throw error;
  }

  if (result == null) {
    throw new Error(
      'ISSUE_20074: WorkflowAgent.generate() is public but returns no result',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
