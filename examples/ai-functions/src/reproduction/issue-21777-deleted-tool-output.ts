import assert from 'node:assert/strict';
import {
  convertToModelMessages,
  generateText,
  tool,
  validateUIMessages,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

const metadataMarker = 'issue-21777-private-metadata:';
const hugeMetadata = metadataMarker + 'x'.repeat(100_000);

class ReproducedBugError extends Error {}

async function main() {
  const foo = tool({
    inputSchema: z.object({ baz: z.number() }),
    outputSchema: z.object({
      summary: z.string(),
      hugeMetadata: z.string(),
    }),
    execute: async () => ({
      summary: 'tiny model-facing result',
      hugeMetadata,
    }),
    toModelOutput: ({ output }) => ({
      type: 'text',
      value: output.summary,
    }),
  });

  const output = await foo.execute!(
    { baz: 1 },
    { toolCallId: 'call-1', messages: [], context: {} },
  );

  assert.equal(
    Symbol.asyncIterator in Object(output),
    false,
    'unexpected streaming tool output',
  );

  const history: UIMessage[] = [
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-foo',
          toolCallId: 'call-1',
          state: 'output-available',
          input: { baz: 1 },
          output,
        },
      ],
    },
  ];

  const original = await validateUIMessages({
    messages: history,
    tools: { foo },
  });
  const before = await convertToModelMessages(original, { tools: { foo } });
  const beforeJson = JSON.stringify(before);
  assert.equal(
    beforeJson.includes(metadataMarker),
    false,
    'toModelOutput did not exclude metadata before deletion',
  );

  const deleted = await validateUIMessages({
    messages: history,
    tools: {},
  });
  assert.equal(
    deleted[0].parts[0].type,
    'dynamic-tool',
    'deleted terminal tool was not normalized to dynamic-tool',
  );

  const after = await convertToModelMessages(deleted, { tools: {} });
  const afterJson = JSON.stringify(after);

  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'ok' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    },
  });

  await generateText({ model, messages: after, tools: {} });
  assert.equal(model.doGenerateCalls.length, 1, 'provider was not called once');
  const providerPromptJson = JSON.stringify(model.doGenerateCalls[0].prompt);

  const retained = await convertToModelMessages(deleted, { tools: { foo } });
  assert.deepEqual(
    retained,
    before,
    'retaining the historical converter did not restore the original output',
  );

  const beforeBytes = Buffer.byteLength(beforeJson);
  const afterBytes = Buffer.byteLength(afterJson);
  const leakedDuringConversion = afterJson.includes(metadataMarker);
  const leakedToProvider = providerPromptJson.includes(metadataMarker);

  if (leakedDuringConversion && leakedToProvider) {
    throw new ReproducedBugError(
      `ISSUE_21777_REPRODUCED: deleting tool foo leaked excluded metadata into model context (${beforeBytes} bytes -> ${afterBytes} bytes)`,
    );
  }

  assert.equal(
    leakedDuringConversion,
    false,
    'deleted tool metadata remained in converted model messages',
  );
  assert.equal(
    leakedToProvider,
    false,
    'deleted tool metadata reached the provider prompt',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
