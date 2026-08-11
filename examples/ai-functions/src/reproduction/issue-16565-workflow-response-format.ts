import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { NoObjectGeneratedError } from 'ai';
import { z } from 'zod';

const failureSignal =
  'ISSUE_16565_REPRODUCED: WorkflowAgent.stream dropped responseFormat and structured output parsing failed';

async function main() {
  const workflowSourcePath = '../../../../packages/workflow/src/' + 'index.ts';
  const { Output, WorkflowAgent } = await import(workflowSourcePath);

  const model = new MockLanguageModelV4({
    doStream: async options => {
      const text =
        options.responseFormat?.type === 'json'
          ? '{"ok":true}'
          : 'The operation completed successfully.';

      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: '1' },
          { type: 'text-delta' as const, id: '1', delta: text },
          { type: 'text-end' as const, id: '1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
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
            providerMetadata: {},
          },
        ]),
      };
    },
  });

  const agent = new WorkflowAgent({
    model,
    output: Output.object({
      schema: z.object({ ok: z.boolean() }),
    }),
  });

  try {
    const result = await agent.stream({
      messages: [{ role: 'user', content: 'Return the structured result.' }],
    });

    if (result.output.ok !== true) {
      throw new Error(
        `Expected structured output {"ok":true}, received ${JSON.stringify(result.output)}`,
      );
    }
  } catch (error) {
    if (
      NoObjectGeneratedError.isInstance(error) &&
      model.doStreamCalls[0]?.responseFormat == null
    ) {
      throw new Error(failureSignal);
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
