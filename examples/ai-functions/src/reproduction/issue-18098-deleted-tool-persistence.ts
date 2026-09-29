import assert from 'node:assert/strict';
import {
  convertToModelMessages,
  safeValidateUIMessages,
  tool,
  type InferUITool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

const currentFoo = tool({
  inputSchema: z.object({
    baz: z.number(),
    bar: z.object({
      buzz: z.boolean(),
    }),
  }),
  outputSchema: z.object({
    summary: z.string(),
    metadata: z.string(),
  }),
  toModelOutput: ({ output }) => ({
    type: 'text',
    value: output.summary,
  }),
});

type CurrentMessage = UIMessage<
  never,
  never,
  { foo: InferUITool<typeof currentFoo> }
>;

const historicalMessages = [
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
          summary: 'tiny model-facing result',
          metadata: 'large persisted metadata that should stay UI-only',
        },
      },
    ],
  },
] as const;

async function main() {
  // Backend schema drift: a historical input that does not satisfy the current
  // registered schema must not be returned under the current static UI type.
  const changedSchemaResult = await safeValidateUIMessages<CurrentMessage>({
    messages: historicalMessages,
    tools: { foo: currentFoo },
  });

  assert.equal(
    changedSchemaResult.success,
    false,
    'stale persisted input was accepted as the current static tool type',
  );
  assert.match(changedSchemaResult.error.message, /parts\[0\]\.input/);

  // Deleted tool: terminal history remains loadable, but it must be normalized
  // to a dynamic part instead of masquerading as the current static tool type.
  const deletedToolResult = await safeValidateUIMessages<CurrentMessage>({
    messages: historicalMessages,
    tools: {},
  });

  assert.equal(deletedToolResult.success, true);
  const historicalPart = deletedToolResult.data[0].parts[0];
  assert.deepEqual(historicalPart, {
    type: 'dynamic-tool',
    toolName: 'foo',
    toolCallId: 'call-1',
    state: 'output-available',
    input: { baz: 1 },
    output: {
      summary: 'tiny model-facing result',
      metadata: 'large persisted metadata that should stay UI-only',
    },
  });

  let enteredCurrentStaticFooBranch = false;
  if (historicalPart.type === 'tool-foo') {
    enteredCurrentStaticFooBranch = true;
    // This is the issue's concrete frontend crash. It is unreachable on main
    // because deleted terminal tools are represented as dynamic tool parts.
    void historicalPart.input.bar.buzz;
  }
  assert.equal(enteredCurrentStaticFooBranch, false);

  // The later issue comment is a separate concern: without the deleted tool
  // definition, convertToModelMessages cannot invoke its old toModelOutput and
  // therefore falls back to the complete persisted JSON output.
  const modelMessages = await convertToModelMessages(deletedToolResult.data, {
    tools: {},
  });
  const serializedModelMessages = JSON.stringify(modelMessages);
  assert.match(
    serializedModelMessages,
    /large persisted metadata that should stay UI-only/,
  );

  console.log(
    'Issue #18098 primary crash does not reproduce: stale registered inputs are rejected and deleted terminal tools become dynamic parts.',
  );
  console.log(
    'Secondary model-output concern confirmed: a deleted tool without its old toModelOutput sends the complete persisted JSON output.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
