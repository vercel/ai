import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const unexpectedToolUseIdResponse = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/anthropic-issue-21832-unexpected-tool-use-id.json',
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

describe('issue #21832', () => {
  it('does not send a tool_result after dropping its invalid toolset tool call', async () => {
    const provider = createAnthropic({
      apiKey: 'test-api-key',
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

    const prompt = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'go' }],
      },
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
    ] satisfies LanguageModelV4Prompt;

    await expect(
      provider('claude-opus-5-5').doGenerate({
        prompt,
        tools: [
          {
            type: 'provider',
            id: 'anthropic.computer_toolset_20260801',
            name: 'computer',
            args: {},
          },
        ],
      }),
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'ok' }],
    });
  });
});
