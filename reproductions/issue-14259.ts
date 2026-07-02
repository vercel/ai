import { convertToModelMessages } from '../packages/ai/src/ui/convert-to-model-messages';
import { createAnthropic } from '../packages/anthropic/src/anthropic-provider';

function findOrphanToolUses(messages: any[]) {
  const orphans: Array<{ messageIndex: number; id: string }> = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role !== 'assistant') {
      continue;
    }

    const toolUseIds =
      message.content
        ?.filter((part: any) => part.type === 'tool_use')
        .map((part: any) => part.id) ?? [];

    if (toolUseIds.length === 0) {
      continue;
    }

    const next = messages[i + 1];
    const nextToolResultIds = new Set(
      next?.role === 'user'
        ? (next.content ?? [])
            .filter((part: any) => part.type === 'tool_result')
            .map((part: any) => part.tool_use_id)
        : [],
    );

    for (const id of toolUseIds) {
      if (!nextToolResultIds.has(id)) {
        orphans.push({ messageIndex: i, id });
      }
    }
  }

  return orphans;
}

async function main() {
  let requestBody: any;

  const provider = createAnthropic({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          model: 'claude-opus-4-6',
          id: 'msg_repro_14259',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });

  const modelMessages = await convertToModelMessages([
    { role: 'user', parts: [{ type: 'text', text: 'start' }] },
    {
      role: 'assistant',
      parts: [
        { type: 'text', text: 'before A' },
        {
          type: 'tool-edit',
          state: 'output-error',
          toolCallId: 'toolu_01R4gLPydCvYg7gc5G9rCkKp',
          input: {},
          errorText: 'Tool execution aborted',
        },
        { type: 'text', text: 'between' },
        {
          type: 'tool-edit',
          state: 'output-available',
          toolCallId: 'toolu_B',
          input: { path: 'x' },
          output: 'ok',
        },
      ],
    },
  ] as any);

  await provider('claude-opus-4-6').doGenerate({
    prompt: modelMessages as any,
  });

  const anthropicMessages = requestBody.messages;
  const orphans = findOrphanToolUses(anthropicMessages);

  console.log(
    JSON.stringify(
      {
        modelMessages,
        anthropicMessages,
        orphans,
      },
      null,
      2,
    ),
  );

  if (orphans.length > 0) {
    throw new Error(
      `Reproduced issue #14259: orphaned Anthropic tool_use ids: ${orphans
        .map(orphan => orphan.id)
        .join(', ')}`,
    );
  }

  const errorResult = anthropicMessages
    .flatMap((message: any) => message.content ?? [])
    .find(
      (part: any) =>
        part.type === 'tool_result' &&
        part.tool_use_id === 'toolu_01R4gLPydCvYg7gc5G9rCkKp',
    );

  if (
    errorResult?.content !== 'Tool execution aborted' ||
    errorResult?.is_error !== true
  ) {
    throw new Error(
      'Unexpected conversion: output-error tool result was not preserved as an Anthropic error tool_result.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
