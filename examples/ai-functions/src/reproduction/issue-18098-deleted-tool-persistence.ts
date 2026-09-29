import {
  convertToModelMessages,
  safeValidateUIMessages,
  tool,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function persistedFooMessage(): UIMessage {
  return {
    id: 'historical-message',
    role: 'assistant',
    parts: [
      {
        type: 'tool-foo',
        toolCallId: 'historical-call',
        state: 'output-available',
        input: { baz: 1 },
        output: {
          summary: 'small user-visible result',
          metadata: 'x'.repeat(10_000),
        },
      },
    ],
  };
}

function getToolResultOutput(messages: ModelMessage[]): unknown {
  const toolMessage = messages.find(message => message.role === 'tool');
  assert(toolMessage?.role === 'tool', 'Expected a tool result message');

  const result = toolMessage.content.find(part => part.type === 'tool-result');
  assert(result?.type === 'tool-result', 'Expected a tool result part');
  return result.output;
}

async function main() {
  const currentFoo = tool({
    inputSchema: z.object({
      baz: z.number(),
      bar: z.object({ buzz: z.boolean() }),
    }),
  });

  const staleSchemaResult = await safeValidateUIMessages({
    messages: [persistedFooMessage()],
    tools: { foo: currentFoo } as any,
  });

  assert(
    !staleSchemaResult.success,
    'ISSUE_18098_REPRODUCED: obsolete persisted foo input was accepted as the current static tool type',
  );

  const deletedToolResult = await safeValidateUIMessages({
    messages: [persistedFooMessage()],
    tools: {
      current: tool({
        inputSchema: z.object({ value: z.string() }),
      }),
    } as any,
  });

  assert(
    deletedToolResult.success,
    'Expected terminal history for a deleted tool to remain loadable',
  );

  const deletedToolPart = deletedToolResult.data[0].parts[0];
  assert(
    deletedToolPart.type === 'dynamic-tool' &&
      deletedToolPart.toolName === 'foo',
    'ISSUE_18098_REPRODUCED: deleted foo remained exposed as a current static tool part',
  );

  const legacyFoo = tool({
    inputSchema: z.object({ baz: z.number() }),
    toModelOutput: () => ({
      type: 'json',
      value: { summary: 'tiny model result' },
    }),
  });

  const projectedModelMessages = await convertToModelMessages(
    [persistedFooMessage()],
    { tools: { foo: legacyFoo } },
  );
  const projectedOutput = getToolResultOutput(projectedModelMessages);
  assert(
    JSON.stringify(projectedOutput).includes('tiny model result') &&
      !JSON.stringify(projectedOutput).includes('"metadata"'),
    'Expected the registered legacy tool to apply toModelOutput',
  );

  const deletedToolModelMessages = await convertToModelMessages(
    deletedToolResult.data,
    {
      tools: {
        current: tool({
          inputSchema: z.object({ value: z.string() }),
        }),
      },
    },
  );
  const deletedToolOutput = getToolResultOutput(deletedToolModelMessages);
  assert(
    JSON.stringify(deletedToolOutput).includes('"metadata"'),
    'Expected conversion without the deleted tool definition to use the raw persisted output',
  );

  console.log(
    'PRIMARY_NOT_REPRODUCED: stale foo input was rejected and deleted foo was normalized to dynamic-tool',
  );
  console.log(
    'SECONDARY_CONFIRMED: removing foo also removes its toModelOutput projection, so raw persisted output is sent to the model',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
