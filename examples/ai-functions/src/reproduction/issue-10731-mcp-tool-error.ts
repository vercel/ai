import {
  experimental_createMCPClient as createMCPClient,
  type JSONRPCMessage,
  type MCPTransport,
} from '@ai-sdk/mcp';
import type {
  LanguageModelV2,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';
import { Chat } from '@ai-sdk/react';
import {
  type ChatTransport,
  type DynamicToolUIPart,
  type UIMessage,
  type UIMessageChunk,
  stepCountIs,
  streamText,
} from 'ai';

const ITERATIONS = 25;
const SECOND_TOOL_TEXT = 'Found 5 indices: logs-2026, users, orders';
const usage: LanguageModelV2Usage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
};

function delayedStream(
  chunks: LanguageModelV2StreamPart[],
  delayMs: number,
): ReadableStream<LanguageModelV2StreamPart> {
  let index = 0;

  return new ReadableStream({
    async pull(controller) {
      if (index === chunks.length) {
        controller.close();
        return;
      }

      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      controller.enqueue(chunks[index++]);
    },
  });
}

class ErrorThenSuccessMCPTransport implements MCPTransport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  readonly toolCalls: string[] = [];

  constructor(private readonly delayMs: number) {}

  async start() {}

  async send(message: JSONRPCMessage) {
    if (!('method' in message) || !('id' in message)) {
      return;
    }

    const respond = (response: JSONRPCMessage) => {
      setTimeout(() => this.onmessage?.(response), this.delayMs);
    };

    if (message.method === 'initialize') {
      respond({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'issue-10731-reproduction', version: '1.0.0' },
        },
      });
      return;
    }

    if (message.method === 'tools/list') {
      respond({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'esql',
              description: 'Run an ES|QL query',
              inputSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            },
            {
              name: 'list_indices',
              description: 'List Elasticsearch indices',
              inputSchema: {
                type: 'object',
                properties: { index_pattern: { type: 'string' } },
                required: ['index_pattern'],
              },
            },
          ],
        },
      });
      return;
    }

    if (message.method === 'tools/call') {
      const name = message.params?.name;
      if (typeof name !== 'string') {
        throw new Error('tools/call did not contain a tool name');
      }
      this.toolCalls.push(name);

      if (name === 'esql') {
        respond({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32603,
            message: 'HTTP status client error (400 Bad Request)',
          },
        });
        return;
      }

      if (name === 'list_indices') {
        respond({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [
              { type: 'text', text: 'Found 5 indices:' },
              { type: 'text', text: SECOND_TOOL_TEXT },
            ],
            isError: false,
          },
        });
        return;
      }
    }

    throw new Error(`Unexpected MCP request: ${JSON.stringify(message)}`);
  }

  async close() {
    this.onclose?.();
  }
}

function createModel(delayMs: number): LanguageModelV2 {
  let call = 0;

  return {
    specificationVersion: 'v2',
    provider: 'issue-10731-mock',
    modelId: 'error-then-second-tool',
    supportedUrls: {},
    async doGenerate() {
      throw new Error('doGenerate is not used by this reproduction');
    },
    async doStream() {
      call++;

      if (call === 1) {
        return {
          stream: delayedStream(
            [
              {
                type: 'tool-input-start',
                id: 'call-esql',
                toolName: 'esql',
              },
              {
                type: 'tool-input-delta',
                id: 'call-esql',
                delta: '{"query":"FROM logs | LIMIT -1"}',
              },
              { type: 'tool-input-end', id: 'call-esql' },
              {
                type: 'tool-call',
                toolCallId: 'call-esql',
                toolName: 'esql',
                input: '{"query":"FROM logs | LIMIT -1"}',
              },
              { type: 'finish', finishReason: 'tool-calls', usage },
            ],
            delayMs,
          ),
        };
      }

      if (call === 2) {
        return {
          stream: delayedStream(
            [
              {
                type: 'tool-input-start',
                id: 'call-list-indices',
                toolName: 'list_indices',
              },
              {
                type: 'tool-input-delta',
                id: 'call-list-indices',
                delta: '{"index_pattern":"*"}',
              },
              { type: 'tool-input-end', id: 'call-list-indices' },
              {
                type: 'tool-call',
                toolCallId: 'call-list-indices',
                toolName: 'list_indices',
                input: '{"index_pattern":"*"}',
              },
              { type: 'finish', finishReason: 'tool-calls', usage },
            ],
            delayMs,
          ),
        };
      }

      return {
        stream: delayedStream(
          [
            { type: 'text-start', id: 'final-text' },
            {
              type: 'text-delta',
              id: 'final-text',
              delta: 'The second tool result was processed.',
            },
            { type: 'text-end', id: 'final-text' },
            { type: 'finish', finishReason: 'stop', usage },
          ],
          delayMs,
        ),
      };
    },
  };
}

function findDynamicTool(
  message: UIMessage,
  toolName: string,
): DynamicToolUIPart | undefined {
  return message.parts.find(
    part => part.type === 'dynamic-tool' && part.toolName === toolName,
  ) as DynamicToolUIPart | undefined;
}

async function runIteration(iteration: number) {
  const delayMs = iteration % 3;
  const mcpTransport = new ErrorThenSuccessMCPTransport(delayMs);
  const mcpClient = await createMCPClient({ transport: mcpTransport });
  const tools = await mcpClient.tools();
  const observedChunks: UIMessageChunk[] = [];

  const chatTransport: ChatTransport<UIMessage> = {
    async sendMessages() {
      const result = streamText({
        model: createModel(delayMs),
        tools,
        prompt: 'Run the ES|QL query, then list the indices if it fails.',
        stopWhen: stepCountIs(3),
      });

      return result.toUIMessageStream().pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            observedChunks.push(chunk);
            controller.enqueue(chunk);
          },
        }),
      );
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new Chat({ transport: chatTransport });

  try {
    await chat.sendMessage({ text: 'Inspect Elasticsearch.' });

    const assistant = chat.messages.at(-1);
    if (assistant?.role !== 'assistant') {
      throw new Error('Expected a final assistant UI message');
    }

    const firstTool = findDynamicTool(assistant, 'esql');
    if (firstTool?.state !== 'output-error') {
      throw new Error(
        `Expected the first MCP tool to be output-error, got ${JSON.stringify(firstTool)}`,
      );
    }

    const secondTool = findDynamicTool(assistant, 'list_indices');
    if (secondTool?.state !== 'output-available') {
      throw new Error(
        `ISSUE #10731 REPRODUCED: second MCP tool result was not available; chat error=${chat.error?.message ?? 'none'}`,
      );
    }

    if (!JSON.stringify(secondTool.output).includes(SECOND_TOOL_TEXT)) {
      throw new Error(
        `ISSUE #10731 REPRODUCED: second MCP tool text was missing from the UI: ${JSON.stringify(secondTool.output)}`,
      );
    }

    const finalText = assistant.parts
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('');
    if (finalText !== 'The second tool result was processed.') {
      throw new Error(
        `ISSUE #10731 REPRODUCED: final model response was not displayed: ${JSON.stringify(finalText)}`,
      );
    }

    if (chat.error != null || chat.status !== 'ready') {
      throw new Error(
        `ISSUE #10731 REPRODUCED: React Chat stopped with status=${chat.status}, error=${chat.error?.message ?? 'none'}`,
      );
    }

    const secondStartIndex = observedChunks.findIndex(
      chunk =>
        chunk.type === 'tool-input-start' &&
        chunk.toolCallId === 'call-list-indices',
    );
    const secondDeltaIndex = observedChunks.findIndex(
      chunk =>
        chunk.type === 'tool-input-delta' &&
        chunk.toolCallId === 'call-list-indices',
    );
    if (secondStartIndex === -1 || secondStartIndex >= secondDeltaIndex) {
      throw new Error(
        `Second tool stream ordering was invalid: ${JSON.stringify(observedChunks)}`,
      );
    }

    if (mcpTransport.toolCalls.join(',') !== 'esql,list_indices') {
      throw new Error(
        `Unexpected MCP tool call sequence: ${mcpTransport.toolCalls.join(',')}`,
      );
    }
  } finally {
    await mcpClient.close();
  }
}

async function confirmMissingStartFailureMode() {
  const chunks: UIMessageChunk[] = [
    { type: 'start' },
    { type: 'start-step' },
    {
      type: 'tool-input-delta',
      toolCallId: 'missing-start',
      inputTextDelta: '{}',
    },
  ];

  const chat = new Chat({
    transport: {
      async sendMessages() {
        return new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        });
      },
      async reconnectToStream() {
        return null;
      },
    },
  });

  await chat.sendMessage({ text: 'Process a malformed stream.' });

  if (
    !(chat.error instanceof TypeError) ||
    chat.error.message !==
      "Cannot read properties of undefined (reading 'text')"
  ) {
    throw new Error(
      `Expected the release-v5.0 missing-start path to retain the reported raw TypeError, got ${chat.error?.name}: ${chat.error?.message}`,
    );
  }
}

async function main() {
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    await runIteration(iteration);
  }

  await confirmMissingStartFailureMode();

  console.log(
    `Could not reproduce issue #10731 in ${ITERATIONS} iterations: the first MCP JSON-RPC error became output-error, the second result remained output-available with its text intact, and React Chat completed without an error. A separately malformed tool-input-delta without tool-input-start still produced the reported raw TypeError.`,
  );
}

main().catch(error => {
  console.error(error);
  throw error;
});
