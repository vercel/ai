import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { createSiliconFlow } from '../siliconflow-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'What is the weather in Paris?' }],
  },
];

function createJsonFetch(response: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

async function streamToArray(
  stream: ReadableStream<LanguageModelV4StreamPart>,
) {
  const parts: LanguageModelV4StreamPart[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }

  return parts;
}

describe('SiliconFlowChatLanguageModel', () => {
  it('parses reasoning_content alongside tool calls', async () => {
    const fetch = createJsonFetch({
      id: 'chatcmpl-1',
      model: 'deepseek-ai/DeepSeek-V3.2',
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            reasoning_content: 'I should call the weather tool.',
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'weather',
                  arguments: '{"location":"Paris"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
    });
    const model = createSiliconFlow({ apiKey: 'test-key', fetch })(
      'deepseek-ai/DeepSeek-V3.2',
    );

    const result = await model.doGenerate({ prompt: TEST_PROMPT });

    expect(result.content).toEqual([
      { type: 'reasoning', text: 'I should call the weather tool.' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: '{"location":"Paris"}',
      },
    ]);
  });

  it('sends reasoning_content back in multi-step tool conversations', async () => {
    const fetch = createJsonFetch({
      choices: [
        {
          message: { role: 'assistant', content: 'Sunny.' },
          finish_reason: 'stop',
        },
      ],
    });
    const model = createSiliconFlow({ apiKey: 'test-key', fetch })(
      'deepseek-ai/DeepSeek-V3.2',
    );

    await model.doGenerate({
      prompt: [
        ...TEST_PROMPT,
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'I should call the weather tool.' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'weather',
              input: { location: 'Paris' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'weather',
              output: { type: 'text', value: 'Sunny' },
            },
          ],
        },
      ],
    });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.messages[1]).toMatchObject({
      role: 'assistant',
      reasoning_content: 'I should call the weather tool.',
    });
  });

  it('streams reasoning before tool calls', async () => {
    const chunks = [
      {
        id: 'chunk-1',
        model: 'deepseek-ai/DeepSeek-V3.2',
        choices: [
          {
            delta: { role: 'assistant', reasoning_content: 'I should call ' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chunk-1',
        model: 'deepseek-ai/DeepSeek-V3.2',
        choices: [
          {
            delta: { reasoning_content: 'the weather tool.' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chunk-1',
        model: 'deepseek-ai/DeepSeek-V3.2',
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call-1',
                  function: { name: 'weather', arguments: '{}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chunk-1',
        model: 'deepseek-ai/DeepSeek-V3.2',
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      },
    ]
      .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
      .join('');
    const fetch = vi.fn().mockResolvedValue(
      new Response(`${chunks}data: [DONE]\n\n`, {
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    const model = createSiliconFlow({ apiKey: 'test-key', fetch })(
      'deepseek-ai/DeepSeek-V3.2',
    );

    const result = await model.doStream({ prompt: TEST_PROMPT });
    const parts = await streamToArray(result.stream);

    expect(parts.filter(part => part.type.startsWith('reasoning'))).toEqual([
      { type: 'reasoning-start', id: 'reasoning-0' },
      {
        type: 'reasoning-delta',
        id: 'reasoning-0',
        delta: 'I should call ',
      },
      {
        type: 'reasoning-delta',
        id: 'reasoning-0',
        delta: 'the weather tool.',
      },
      { type: 'reasoning-end', id: 'reasoning-0' },
    ]);
  });
});
