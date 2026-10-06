import {
  convertToModelMessages,
  generateText,
  tool,
  validateUIMessages,
} from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import { z } from 'zod/v4';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), message);
}

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
    toModelOutput: output => ({
      type: 'text',
      value: output.summary,
    }),
  });

  const execute = foo.execute;
  assert(execute, 'reproduction tool must be executable');
  const persistedOutput = await execute(
    { baz: 1 },
    { toolCallId: 'call-1', messages: [] },
  );
  const history: any[] = [
    {
      id: 'assistant-1',
      role: 'assistant' as const,
      parts: [
        {
          type: 'tool-foo',
          toolCallId: 'call-1',
          state: 'output-available' as const,
          input: { baz: 1 },
          output: persistedOutput,
        },
      ],
    },
  ];

  const original = await validateUIMessages({
    messages: history,
    tools: { foo } as any,
  });
  const before = convertToModelMessages(original, { tools: { foo } });
  assertEqual(
    JSON.stringify(before).includes(hugeMetadata),
    false,
    'toModelOutput must exclude persisted metadata while the tool exists',
  );

  const deleted = await validateUIMessages({
    messages: history,
    tools: {},
  });
  assertEqual(
    deleted[0].parts[0].type,
    'dynamic-tool',
    'deleted static tools must be normalized to dynamic-tool parts',
  );
  const after = convertToModelMessages(deleted, { tools: {} });

  const retained = convertToModelMessages(deleted, { tools: { foo } });
  assertEqual(
    JSON.stringify(retained),
    JSON.stringify(before),
    'retaining the historical converter must preserve the original model output',
  );

  const model = new MockLanguageModelV2({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'ok' }],
      finishReason: 'stop',
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      },
      warnings: [],
    }),
  });
  await generateText({
    model,
    messages: after,
    tools: {},
    maxRetries: 0,
  });

  const serializedBefore = JSON.stringify(before);
  const serializedAfter = JSON.stringify(after);
  const serializedProviderPrompt = JSON.stringify(
    model.doGenerateCalls[0]?.prompt,
  );
  const conversionLeaksMetadata = serializedAfter.includes(hugeMetadata);
  const providerReceivesMetadata =
    serializedProviderPrompt.includes(hugeMetadata);

  console.log({
    beforeBytes: new TextEncoder().encode(serializedBefore).byteLength,
    afterBytes: new TextEncoder().encode(serializedAfter).byteLength,
    conversionLeaksMetadata,
    providerReceivesMetadata,
    retainedMatchesBefore: true,
  });

  assertEqual(
    conversionLeaksMetadata || providerReceivesMetadata,
    false,
    'ISSUE_21777_REPRODUCED: deleted tool leaked persisted metadata into model context',
  );
}

main().catch(error => {
  console.error(error);
  throw error;
});
