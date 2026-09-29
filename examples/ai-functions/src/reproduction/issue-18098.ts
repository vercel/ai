import assert from 'node:assert/strict';
import {
  convertToModelMessages,
  tool,
  validateUIMessages,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

const currentFoo = tool({
  inputSchema: z.object({
    baz: z.number(),
    bar: z.object({ buzz: z.boolean() }),
  }),
  outputSchema: z.object({
    summary: z.string(),
    hugeMetadata: z.string(),
  }),
  toModelOutput: output => ({
    type: 'text',
    value: output.summary,
  }),
});

type CurrentMessage = UIMessage<
  never,
  never,
  {
    foo: {
      input: {
        baz: number;
        bar: { buzz: boolean };
      };
      output: {
        summary: string;
        hugeMetadata: string;
      };
    };
  }
>;

const persistedMessages = [
  {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      {
        type: 'tool-foo',
        toolCallId: 'call-1',
        state: 'output-available',
        input: { baz: 1 },
        output: {
          summary: 'small model-facing result',
          hugeMetadata: 'x'.repeat(10_000),
        },
      },
    ],
  },
] as const;

function renderPersistedPart(part: CurrentMessage['parts'][number]): string {
  if (part.type === 'tool-foo' && part.state === 'output-available') {
    return String(part.input.bar.buzz);
  }

  if (part.type === 'dynamic-tool') {
    return `Unavailable historical tool: ${part.toolName}`;
  }

  return `Other part or state: ${part.type}`;
}

async function main() {
  let staleInputWasRejected = false;

  try {
    await validateUIMessages<CurrentMessage>({
      messages: persistedMessages,
      tools: { foo: currentFoo },
    });
  } catch {
    staleInputWasRejected = true;
  }

  assert.equal(
    staleInputWasRejected,
    true,
    'schema-drifted terminal input was exposed under the current static type',
  );

  const validatedAfterDeletion = await validateUIMessages<CurrentMessage>({
    messages: persistedMessages,
    tools: {},
  });
  const deletedToolPart = validatedAfterDeletion[0].parts[0];
  const rendered = renderPersistedPart(deletedToolPart);

  assert.equal(
    deletedToolPart.type,
    'dynamic-tool',
    'deleted terminal tool remained a statically typed tool-foo part',
  );

  assert.equal(rendered, 'Unavailable historical tool: foo');

  const modelMessages = convertToModelMessages(
    validatedAfterDeletion.map(({ role, parts }) => ({ role, parts })),
    { tools: {} },
  );
  const serializedModelMessages = JSON.stringify(modelMessages);

  assert.match(
    serializedModelMessages,
    /"hugeMetadata":"x+/,
    'deleted tool output was unexpectedly reduced before model conversion',
  );

  console.log(
    'Primary deleted-tool frontend crash not reproduced: the persisted part was normalized to dynamic-tool.',
  );
  console.log(
    'Schema drift was rejected before the stale input could reach the frontend.',
  );
  console.log(
    'Additional comment confirmed: deleted-tool conversion sent the raw hugeMetadata output to the model.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
