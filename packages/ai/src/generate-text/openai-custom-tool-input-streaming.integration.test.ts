import { createOpenAI } from '@ai-sdk/openai';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { readUIMessageStream } from '../ui-message-stream/read-ui-message-stream';
import { isToolUIPart } from '../ui/ui-messages';
import { streamText } from './stream-text';

describe('OpenAI custom tool input streaming integration', () => {
  const server = createTestServer({
    'https://api.test.com/openai/v1/responses': {},
  });

  it('exposes raw custom tool input progressively in UI messages', async () => {
    const response = {
      id: 'resp_custom_tool_test',
      object: 'response',
      created_at: 1_741_257_730,
      status: 'in_progress',
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
      model: 'gpt-5.2-codex',
      output: [],
      parallel_tool_calls: true,
      previous_response_id: null,
      reasoning: { effort: 'low', summary: null },
      store: true,
      temperature: 1,
      text: { format: { type: 'text' } },
      tool_choice: 'required',
      tools: [
        {
          type: 'custom',
          name: 'write_sql',
          description: 'Write a SQL SELECT query.',
          format: { type: 'text' },
        },
      ],
      top_p: 1,
      truncation: 'disabled',
      usage: null,
      user: null,
      metadata: {},
    };

    const events = [
      { type: 'response.created', response },
      { type: 'response.in_progress', response },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'custom_tool_call',
          id: 'custom_tool_call_1',
          call_id: 'call_1',
          name: 'write_sql',
          input: '',
        },
      },
      {
        type: 'response.custom_tool_call_input.delta',
        item_id: 'custom_tool_call_1',
        output_index: 0,
        delta: 'SELECT * ',
      },
      {
        type: 'response.custom_tool_call_input.delta',
        item_id: 'custom_tool_call_1',
        output_index: 0,
        delta: 'FROM users',
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'custom_tool_call',
          id: 'custom_tool_call_1',
          call_id: 'call_1',
          name: 'write_sql',
          input: 'SELECT * FROM users',
          status: 'completed',
        },
      },
      {
        type: 'response.completed',
        response: {
          ...response,
          status: 'completed',
          output: [
            {
              type: 'custom_tool_call',
              id: 'custom_tool_call_1',
              call_id: 'call_1',
              name: 'write_sql',
              input: 'SELECT * FROM users',
              status: 'completed',
            },
          ],
          usage: {
            input_tokens: 10,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 5,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 15,
          },
        },
      },
    ];

    server.urls['https://api.test.com/openai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: events.map(event => `data: ${JSON.stringify(event)}\n\n`),
    };

    const openai = createOpenAI({
      apiKey: 'test-api-key',
      baseURL: 'https://api.test.com/openai/v1',
    });
    const tools = {
      write_sql: openai.tools.customTool({
        description: 'Write a SQL SELECT query.',
        format: { type: 'text' },
      }),
    };
    const result = streamText({
      model: openai.responses('gpt-5.2-codex'),
      tools,
      toolChoice: 'required',
      prompt: 'Write a SQL query.',
    });

    const streamingInputs: unknown[] = [];

    for await (const message of readUIMessageStream({
      stream: result.toUIMessageStream(),
    })) {
      const toolPart = message.parts.find(
        part => isToolUIPart(part) && part.type === 'tool-write_sql',
      );

      if (
        toolPart != null &&
        isToolUIPart(toolPart) &&
        toolPart.state === 'input-streaming'
      ) {
        streamingInputs.push(toolPart.input);
      }
    }

    expect(streamingInputs).toEqual([
      undefined,
      'SELECT * ',
      'SELECT * FROM users',
    ]);
  });
});
