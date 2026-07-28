import {
  experimental_createSession,
  generateText,
  isStepCount,
  streamText,
  tool,
} from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { createOpenAI } from '../openai-provider';

class MockResponsesWebSocket {
  static instances: MockResponsesWebSocket[] = [];
  static respond: (
    request: Record<string, unknown>,
    socket: MockResponsesWebSocket,
  ) => void;

  readyState = 0;
  bufferedAmount = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  sent: Array<Record<string, unknown>> = [];

  constructor(
    readonly url: string | URL,
    readonly options?: { headers?: Record<string, string> },
  ) {
    MockResponsesWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }

  send(data: string) {
    const request = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(request);
    queueMicrotask(() => MockResponsesWebSocket.respond(request, this));
  }

  emit(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  close() {
    this.readyState = 3;
  }
}

const usage = {
  input_tokens: 2,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: 2,
  output_tokens_details: { reasoning_tokens: 0 },
};

function completedResponse({ id, output }: { id: string; output: unknown[] }) {
  return {
    type: 'response.completed',
    sequence_number: 10,
    response: {
      id,
      created_at: 1,
      model: 'gpt-5.6',
      output,
      usage,
      incomplete_details: null,
      raw_marker: 'preserved',
    },
  };
}

function messageResponse(id: string, text: string) {
  return completedResponse({
    id,
    output: [
      {
        type: 'message',
        role: 'assistant',
        id: `msg_${id}`,
        phase: null,
        content: [
          {
            type: 'output_text',
            text,
            annotations: [],
            logprobs: null,
          },
        ],
      },
    ],
  });
}

function failedResponse({
  message = 'Response failed.',
  incompleteReason = null,
}: {
  message?: string;
  incompleteReason?: string | null;
} = {}) {
  return {
    type: 'response.failed',
    sequence_number: 10,
    response: {
      error: {
        code: 'server_error',
        message,
      },
      incomplete_details:
        incompleteReason == null ? null : { reason: incompleteReason },
      usage: null,
      service_tier: null,
    },
  };
}

describe('OpenAI Responses WebSocket public lifecycle', () => {
  beforeEach(() => {
    MockResponsesWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockResponsesWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses HTTP by default without constructing a WebSocket', async () => {
    const response = messageResponse('resp_http', 'Hello over HTTP').response;
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const openai = createOpenAI({ apiKey: 'test-key', fetch });

    const result = await generateText({
      model: openai('gpt-5.6'),
      prompt: 'Say hello.',
      maxRetries: 0,
    });

    expect(result.text).toBe('Hello over HTTP');
    expect(fetch).toHaveBeenCalledOnce();
    expect(MockResponsesWebSocket.instances).toHaveLength(0);
  });

  it('rejects a direct sessionless model call before opening a socket', async () => {
    const openai = createOpenAI({ apiKey: 'test-key' });

    await expect(
      openai('gpt-5.6').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        providerOptions: {
          openai: { transport: 'websocket' },
        },
      }),
    ).rejects.toThrow(
      "OpenAI Responses transport 'websocket' requires an AI SDK session",
    );
    expect(MockResponsesWebSocket.instances).toHaveLength(0);
  });

  it.each([
    ['conversation', { conversation: 'conv_1' }],
    ['previousResponseId', { previousResponseId: 'resp_1' }],
  ] as const)(
    'rejects %s in WebSocket mode before opening a socket',
    async (optionName, option) => {
      const openai = createOpenAI({ apiKey: 'test-key' });

      await expect(
        generateText({
          model: openai('gpt-5.6'),
          prompt: 'Hello',
          maxRetries: 0,
          providerOptions: {
            openai: {
              transport: 'websocket',
              ...option,
            },
          },
        }),
      ).rejects.toThrow(
        `${optionName} is not supported with OpenAI Responses WebSocket transport`,
      );
      expect(MockResponsesWebSocket.instances).toHaveLength(0);
    },
  );

  it('reuses one socket and sends the complete prompt on every tool step', async () => {
    MockResponsesWebSocket.respond = (_request, socket) => {
      if (socket.sent.length === 1) {
        socket.emit(
          completedResponse({
            id: 'resp_1',
            output: [
              {
                type: 'function_call',
                id: 'fc_1',
                call_id: 'call_1',
                name: 'weather',
                arguments: '{"city":"San Francisco"}',
                namespace: null,
              },
            ],
          }),
        );
      } else {
        socket.emit(messageResponse('resp_2', 'It is 72°F.'));
      }
    };

    const openai = createOpenAI({ apiKey: 'test-key' });
    const result = await generateText({
      model: openai('gpt-5.6'),
      prompt: 'What is the weather in San Francisco?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async () => ({ temperature: 72 }),
        }),
      },
      stopWhen: isStepCount(2),
      maxRetries: 0,
      include: { responseBody: true },
      providerOptions: {
        openai: {
          transport: 'websocket',
        },
      },
    });

    expect(result.text).toBe('It is 72°F.');
    expect(MockResponsesWebSocket.instances).toHaveLength(1);
    const socket = MockResponsesWebSocket.instances[0];
    expect(socket.sent).toHaveLength(2);
    expect(socket.sent[1]).not.toHaveProperty('previous_response_id');
    expect(socket.sent[1]).not.toHaveProperty('conversation');

    const secondInput = JSON.stringify(socket.sent[1].input);
    expect(secondInput).toContain('What is the weather in San Francisco?');
    expect(secondInput).toContain('call_1');
    expect(secondInput).toContain('temperature');
    expect(result.response.body).toMatchObject({
      id: 'resp_2',
      raw_marker: 'preserved',
    });
  });

  it('reuses one socket for unrelated calls sharing a Session', async () => {
    MockResponsesWebSocket.respond = (_request, socket) => {
      socket.emit(
        socket.sent.length === 1
          ? messageResponse('resp_story', 'A long story about a cat.')
          : messageResponse('resp_shortened', 'A short story about a cat.'),
      );
    };

    const openai = createOpenAI({ apiKey: 'test-key' });
    const model = openai('gpt-5.6');
    const session = experimental_createSession();

    try {
      const first = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Write a five-paragraph cat story.' },
            ],
          },
        ],
        experimental_session: session,
        providerOptions: {
          openai: { transport: 'websocket' },
        },
      });
      const longStory = first.content.find(part => part.type === 'text')?.text;
      expect(longStory).toBe('A long story about a cat.');

      const secondPrompt = `Shorten this story: ${longStory}`;
      const second = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: secondPrompt }],
          },
        ],
        experimental_session: session,
        providerOptions: {
          openai: { transport: 'websocket' },
        },
      });

      expect(second.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: 'A short story about a cat.',
          }),
        ]),
      );
      expect(MockResponsesWebSocket.instances).toHaveLength(1);
      const socket = MockResponsesWebSocket.instances[0];
      expect(socket.sent).toHaveLength(2);
      expect(socket.sent[1]).toMatchObject({
        type: 'response.create',
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: secondPrompt }],
          },
        ],
      });
      expect(socket.sent[1]).not.toHaveProperty('previous_response_id');
    } finally {
      await session.destroy();
    }
  });

  it('does not retry response.failed after a request was sent', async () => {
    MockResponsesWebSocket.respond = (_request, socket) => {
      socket.emit(failedResponse());
    };

    const openai = createOpenAI({ apiKey: 'test-key' });

    await expect(
      generateText({
        model: openai('gpt-5.6'),
        prompt: 'Hello.',
        maxRetries: 2,
        providerOptions: {
          openai: { transport: 'websocket' },
        },
      }),
    ).rejects.toMatchObject({
      message: 'Response failed.',
      isRetryable: false,
    });
    expect(MockResponsesWebSocket.instances).toHaveLength(1);
    expect(MockResponsesWebSocket.instances[0].sent).toHaveLength(1);
  });

  it('maps an incomplete WebSocket response', async () => {
    MockResponsesWebSocket.respond = (_request, socket) => {
      const response = messageResponse('resp_incomplete', 'Partial response');
      socket.emit({
        ...response,
        type: 'response.incomplete',
        response: {
          ...response.response,
          incomplete_details: { reason: 'max_output_tokens' },
        },
      });
    };

    const openai = createOpenAI({ apiKey: 'test-key' });
    const result = await generateText({
      model: openai('gpt-5.6'),
      prompt: 'Hello.',
      maxRetries: 0,
      include: { responseBody: true },
      providerOptions: {
        openai: { transport: 'websocket' },
      },
    });

    expect(result.text).toBe('Partial response');
    expect(result.finishReason).toBe('length');
    expect(result.finalStep.response.body).toMatchObject({
      id: 'resp_incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      raw_marker: 'preserved',
    });
  });

  it('sends Core-repaired tool history as part of the full second input', async () => {
    MockResponsesWebSocket.respond = (_request, socket) => {
      if (socket.sent.length === 1) {
        socket.emit(
          completedResponse({
            id: 'resp_repair',
            output: [
              {
                type: 'function_call',
                id: 'fc_repair',
                call_id: 'call_repair',
                name: 'weather',
                arguments: '{"city":123}',
                namespace: null,
              },
            ],
          }),
        );
      } else {
        socket.emit(messageResponse('resp_repair_done', 'It is 72°F.'));
      }
    };

    const openai = createOpenAI({ apiKey: 'test-key' });

    const result = await generateText({
      model: openai('gpt-5.6'),
      prompt: 'What is the weather?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async ({ city }) => ({ city, temperature: 72 }),
        }),
      },
      repairToolCall: async ({ toolCall }) => ({
        ...toolCall,
        input: '{"city":"San Francisco"}',
      }),
      stopWhen: isStepCount(2),
      maxRetries: 0,
      providerOptions: {
        openai: {
          transport: 'websocket',
        },
      },
    });

    expect(result.text).toBe('It is 72°F.');
    expect(MockResponsesWebSocket.instances).toHaveLength(1);
    const socket = MockResponsesWebSocket.instances[0];
    expect(socket.sent).toHaveLength(2);
    expect(socket.sent[1]).not.toHaveProperty('previous_response_id');
    expect(JSON.stringify(socket.sent[1].input)).toContain('San Francisco');
  });

  it('feeds WebSocket events through the existing stream mapper', async () => {
    MockResponsesWebSocket.respond = (_request, socket) => {
      socket.emit({
        type: 'response.created',
        response: {
          id: 'resp_stream',
          created_at: 1,
          model: 'gpt-5.6',
          service_tier: null,
        },
      });
      socket.emit({
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          id: 'msg_stream',
          type: 'message',
          status: 'in_progress',
          role: 'assistant',
          content: [],
        },
      });
      socket.emit({
        type: 'response.output_text.delta',
        item_id: 'msg_stream',
        output_index: 0,
        content_index: 0,
        delta: 'Hello over WebSocket',
      });
      socket.emit({
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: 'msg_stream',
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Hello over WebSocket',
              annotations: [],
              logprobs: null,
            },
          ],
        },
      });
      socket.emit(messageResponse('resp_stream', 'Hello over WebSocket'));
    };

    const openai = createOpenAI({ apiKey: 'test-key' });
    const result = streamText({
      model: openai('gpt-5.6'),
      prompt: 'Say hello.',
      maxRetries: 0,
      includeRawChunks: true,
      providerOptions: {
        openai: { transport: 'websocket' },
      },
    });

    let sawCreatedRawChunk = false;
    for await (const part of result.fullStream) {
      if (
        part.type === 'raw' &&
        typeof part.rawValue === 'object' &&
        part.rawValue != null &&
        'type' in part.rawValue &&
        part.rawValue.type === 'response.created'
      ) {
        sawCreatedRawChunk = true;
      }
    }
    expect(await result.text).toBe('Hello over WebSocket');
    expect(sawCreatedRawChunk).toBe(true);
    expect(MockResponsesWebSocket.instances).toHaveLength(1);
  });

  it('surfaces response.failed before stream output without retrying', async () => {
    MockResponsesWebSocket.respond = (_request, socket) => {
      socket.emit(failedResponse());
    };

    const onError = vi.fn();
    const openai = createOpenAI({ apiKey: 'test-key' });
    const result = streamText({
      model: openai('gpt-5.6'),
      prompt: 'Say hello.',
      maxRetries: 2,
      onError,
      providerOptions: {
        openai: { transport: 'websocket' },
      },
    });

    await result.consumeStream();

    expect(onError).toHaveBeenCalledWith({
      error: expect.objectContaining({
        message: 'Response failed.',
        isRetryable: false,
      }),
    });
    expect(MockResponsesWebSocket.instances).toHaveLength(1);
    expect(MockResponsesWebSocket.instances[0].sent).toHaveLength(1);
  });

  it('surfaces response.failed after stream output', async () => {
    MockResponsesWebSocket.respond = (_request, socket) => {
      socket.emit({
        type: 'response.created',
        response: {
          id: 'resp_failed_late',
          created_at: 1,
          model: 'gpt-5.6',
          service_tier: null,
        },
      });
      socket.emit({
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          id: 'msg_failed_late',
          type: 'message',
          status: 'in_progress',
          role: 'assistant',
          content: [],
        },
      });
      socket.emit({
        type: 'response.output_text.delta',
        item_id: 'msg_failed_late',
        output_index: 0,
        content_index: 0,
        delta: 'Partial output',
      });
      socket.emit(
        failedResponse({
          incompleteReason: 'max_output_tokens',
        }),
      );
    };

    const onError = vi.fn();
    const openai = createOpenAI({ apiKey: 'test-key' });
    const result = streamText({
      model: openai('gpt-5.6'),
      prompt: 'Say hello.',
      maxRetries: 2,
      onError,
      providerOptions: {
        openai: { transport: 'websocket' },
      },
    });

    await result.consumeStream();

    expect(await result.text).toBe('Partial output');
    expect(await result.finishReason).toBe('length');
    expect(onError).toHaveBeenCalledWith({
      error: expect.objectContaining({
        message: 'Response failed.',
        isRetryable: false,
      }),
    });
    expect(MockResponsesWebSocket.instances).toHaveLength(1);
    expect(MockResponsesWebSocket.instances[0].sent).toHaveLength(1);
  });
});
