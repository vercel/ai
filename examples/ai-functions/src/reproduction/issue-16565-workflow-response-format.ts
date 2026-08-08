import { strict as assert } from 'node:assert';
import {
  WorkflowAgent,
  Output,
} from '../../../../packages/workflow/dist/index.mjs';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

async function main() {
  const model = new MockLanguageModelV4({
    doStream: async options => {
      const receivedJsonResponseFormat =
        options.responseFormat?.type === 'json';
      const text = receivedJsonResponseFormat
        ? '{"ok":true}'
        : 'I was not given a JSON response format.';

      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: '1' });
            controller.enqueue({ type: 'text-delta', id: '1', delta: text });
            controller.enqueue({ type: 'text-end', id: '1' });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: {
                  total: 0,
                  noCache: 0,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 0,
                  text: 0,
                  reasoning: undefined,
                },
              },
            });
            controller.close();
          },
        }),
      };
    },
  });

  const agent = new WorkflowAgent({
    model,
    output: Output.object({ schema: z.object({ ok: z.boolean() }) }),
  });

  try {
    const result = await agent.stream({
      messages: [{ role: 'user', content: 'go' }],
    });

    assert.deepEqual(result.output, { ok: true });
    assert.equal(model.doStreamCalls[0]?.responseFormat?.type, 'json');
  } catch (error) {
    console.error(
      'WorkflowAgent structured output stream reproduction failed.',
    );
    console.error(
      'Expected WorkflowAgent.stream() to pass a JSON responseFormat to the model and return { ok: true }.',
    );
    console.error(
      'Observed model doStream responseFormat:',
      model.doStreamCalls[0]?.responseFormat ?? null,
    );
    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
