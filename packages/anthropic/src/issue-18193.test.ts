import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';

describe('issue 18193', () => {
  it('preserves live code-execution input when replaying the transcript', async () => {
    const events = fs
      .readFileSync(
        'src/__fixtures__/anthropic-code-execution-20260120-issue-18193.chunks.txt',
        'utf8',
      )
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    const start = events.find(
      event =>
        event.type === 'content_block_start' &&
        event.content_block.type === 'server_tool_use',
    );
    const rawInput = events
      .filter(
        event =>
          event.type === 'content_block_delta' &&
          event.index === start.index &&
          event.delta.type === 'input_json_delta',
      )
      .map(event => event.delta.partial_json)
      .join('');
    const wireInput = JSON.parse(rawInput);

    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: start.content_block.id,
              toolName: 'code_execution',
              input: {
                type: start.content_block.name,
                ...wireInput,
              },
              providerExecuted: true,
            },
          ],
        },
      ],
      sendReasoning: false,
      warnings: [],
    });

    const replayedBlock = result.prompt.messages[0].content[0];
    expect(replayedBlock).toMatchObject({
      type: 'server_tool_use',
      name: start.content_block.name,
    });
    if (replayedBlock.type !== 'server_tool_use') {
      throw new Error('Expected a server_tool_use replay block');
    }
    expect(replayedBlock.input).toEqual(wireInput);
  });
});
