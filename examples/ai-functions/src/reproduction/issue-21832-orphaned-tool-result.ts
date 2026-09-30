import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, type ModelMessage } from 'ai';
import fs from 'node:fs';

const unexpectedToolUseIdResponse = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../../../packages/anthropic/src/__fixtures__/anthropic-issue-21832-unexpected-tool-use-id.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

function hasOrphanedToolResult(requestBody: {
  messages: Array<{
    content: Array<{
      type: string;
      id?: string;
      tool_use_id?: string;
    }>;
  }>;
}) {
  const parts = requestBody.messages.flatMap(message => message.content);
  const toolUseIds = new Set(
    parts
      .filter(part => part.type === 'tool_use')
      .map(part => part.id)
      .filter((id): id is string => id != null),
  );

  return parts.some(
    part =>
      part.type === 'tool_result' &&
      part.tool_use_id != null &&
      !toolUseIds.has(part.tool_use_id),
  );
}

async function main() {
  const anthropic = createAnthropic({
    apiKey: 'test',
    fetch: async (_url, init) => {
      const requestBody = JSON.parse(init!.body as string);

      if (hasOrphanedToolResult(requestBody)) {
        return Response.json(unexpectedToolUseIdResponse, { status: 400 });
      }

      return Response.json({
        id: 'msg_fixed',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });

  const messages = [
    { role: 'user', content: 'go' },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'T1',
          toolName: 'computer',
          input: {
            action: null,
            actions: [
              {
                action: 'mouse_move',
                coordinate: [1, 2],
              },
            ],
          },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'T1',
          toolName: 'computer',
          output: {
            type: 'error-text',
            value: 'Invalid input for tool computer',
          },
        },
      ],
    },
  ] as ModelMessage[];

  try {
    await generateText({
      model: anthropic('claude-opus-5-5'),
      messages,
      tools: {
        computer: anthropic.tools.computerToolset_20260801({
          execute: async () => 'ran',
        }),
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('unexpected `tool_use_id`')
    ) {
      throw new Error(
        'Issue #21832 reproduced: Anthropic rejected an orphaned tool_result with unexpected tool_use_id.',
        { cause: error },
      );
    }

    throw error;
  }

  console.log(
    'Issue #21832 not reproduced: the Anthropic request contained no orphaned tool_result.',
  );
}

main();
