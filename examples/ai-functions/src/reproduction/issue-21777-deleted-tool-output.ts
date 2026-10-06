import assert from 'node:assert/strict';
import {
  convertToModelMessages,
  generateText,
  tool,
  validateUIMessages,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod/v4';

async function main() {
  const hugeMetadata = 'x'.repeat(100_000);
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

  assert.ok(foo.execute, 'setup failed: tool execute function is unavailable');
  const output = await foo.execute(
    { baz: 1 },
    { toolCallId: 'call-1', messages: [] },
  );
  const history = [
    {
      id: 'assistant-1',
      role: 'assistant' as const,
      parts: [
        {
          type: 'tool-foo' as const,
          toolCallId: 'call-1',
          state: 'output-available' as const,
          input: { baz: 1 },
          output,
        },
      ],
    },
  ];

  const original = await validateUIMessages({
    messages: history,
    tools: { foo } as any,
  });
  const before = await convertToModelMessages(original, { tools: { foo } });
  assert.equal(
    JSON.stringify(before).includes(hugeMetadata),
    false,
    'setup failed: toModelOutput did not exclude metadata',
  );

  const deleted = await validateUIMessages({ messages: history, tools: {} });
  assert.equal(
    deleted[0].parts[0].type,
    'dynamic-tool',
    'setup failed: deleted static tool was not normalized to dynamic-tool',
  );

  const after = await convertToModelMessages(deleted, { tools: {} });
  const retained = await convertToModelMessages(deleted, { tools: { foo } });
  assert.deepEqual(
    retained,
    before,
    'setup failed: retaining the historical converter did not restore output',
  );

  const model = new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'done' }],
      finishReason: { raw: undefined, unified: 'stop' },
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
      warnings: [],
    }),
  });
  await generateText({ model, messages: after, tools: {} });

  const beforeBytes = Buffer.byteLength(JSON.stringify(before));
  const afterBytes = Buffer.byteLength(JSON.stringify(after));
  const conversionLeakedMetadata = JSON.stringify(after).includes(hugeMetadata);
  const providerLeakedMetadata = JSON.stringify(
    model.doGenerateCalls[0].prompt,
  ).includes(hugeMetadata);

  console.log(
    JSON.stringify({
      beforeBytes,
      afterBytes,
      deletedPartType: deleted[0].parts[0].type,
      conversionLeakedMetadata,
      providerLeakedMetadata,
      retainedConverterRestoredOutput: true,
    }),
  );

  if (conversionLeakedMetadata || providerLeakedMetadata) {
    throw new Error(
      'ISSUE_21777: deleted tool leaked excluded metadata into model context',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
