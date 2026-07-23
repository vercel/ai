import {
  createMCPClient,
  type JSONRPCMessage,
  type MCPTransport,
} from '@ai-sdk/mcp';
import { Chat } from '@ai-sdk/react';
import { DirectChatTransport, isStepCount, ToolLoopAgent } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

class ErrorThenSuccessMCPTransport implements MCPTransport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  protocolVersion?: string;

  esqlCallCount = 0;
  listIndicesCallCount = 0;

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    if (!('method' in message) || !('id' in message)) {
      return;
    }

    if (message.method === 'initialize') {
      const params = message.params as { protocolVersion?: string } | undefined;

      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2025-11-25',
          serverInfo: {
            name: 'issue-10731-reproduction',
            version: '1.0.0',
          },
          capabilities: { tools: {} },
        },
      });
      return;
    }

    if (message.method === 'tools/list') {
      this.onmessage?.({
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
      const params = message.params as
        | { name?: string; arguments?: Record<string, unknown> }
        | undefined;

      if (params?.name === 'esql') {
        this.esqlCallCount++;
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32603,
            message: 'HTTP status client error (400 Bad Request)',
          },
        });
        return;
      }

      if (params?.name === 'list_indices') {
        this.listIndicesCallCount++;
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [
              { type: 'text', text: 'Found 5 indices:' },
              { type: 'text', text: '["index-a","index-b"]' },
            ],
            isError: false,
          },
        });
      }
    }
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}

function createModel() {
  let step = 0;

  return new MockLanguageModelV3({
    doStream: async () => {
      step++;

      if (step === 1) {
        return {
          stream: convertArrayToReadableStream([
            {
              type: 'tool-input-start',
              id: 'call-esql',
              toolName: 'esql',
            },
            {
              type: 'tool-input-delta',
              id: 'call-esql',
              delta: '{"query":"invalid query"}',
            },
            { type: 'tool-input-end', id: 'call-esql' },
            {
              type: 'tool-call',
              toolCallId: 'call-esql',
              toolName: 'esql',
              input: '{"query":"invalid query"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              usage,
            },
          ]),
        };
      }

      if (step === 2) {
        return {
          stream: convertArrayToReadableStream([
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
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              usage,
            },
          ]),
        };
      }

      return {
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: 'final-text' },
          {
            type: 'text-delta',
            id: 'final-text',
            delta: 'Recovered after the MCP error.',
          },
          { type: 'text-end', id: 'final-text' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      };
    },
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const mcpTransport = new ErrorThenSuccessMCPTransport();
  const mcpClient = await createMCPClient({
    transport: mcpTransport,
    maxRetries: 0,
  });

  try {
    const tools = await mcpClient.tools();
    const iterations = 25;

    for (let iteration = 1; iteration <= iterations; iteration++) {
      const agent = new ToolLoopAgent({
        model: createModel(),
        tools,
        stopWhen: isStepCount(3),
      });
      const chat = new Chat({
        id: `issue-10731-${iteration}`,
        transport: new DirectChatTransport({ agent }),
      });

      await chat.sendMessage({ text: 'Run ES|QL, then list the indices.' });

      assert(
        chat.status === 'ready',
        `Iteration ${iteration}: React chat stopped with status "${chat.status}": ${chat.error?.message}`,
      );
      assert(
        chat.error == null,
        `Iteration ${iteration}: React chat exposed an error: ${chat.error?.message}`,
      );

      const assistantMessage = chat.messages.at(-1);
      assert(
        assistantMessage?.role === 'assistant',
        `Iteration ${iteration}: missing assistant response`,
      );

      const firstTool = assistantMessage.parts.find(
        part => part.type === 'dynamic-tool' && part.toolCallId === 'call-esql',
      );
      assert(
        firstTool?.type === 'dynamic-tool' &&
          firstTool.state === 'output-error',
        `Iteration ${iteration}: first MCP JSON-RPC error was not represented as a tool error`,
      );

      const secondTool = assistantMessage.parts.find(
        part =>
          part.type === 'dynamic-tool' &&
          part.toolCallId === 'call-list-indices',
      );
      assert(
        secondTool?.type === 'dynamic-tool' &&
          secondTool.state === 'output-available',
        `Iteration ${iteration}: second MCP tool result was not processed`,
      );
      assert(
        JSON.stringify(secondTool.output).includes('Found 5 indices:'),
        `Iteration ${iteration}: second MCP tool output was missing its text content`,
      );

      const finalText = assistantMessage.parts
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('');
      assert(
        finalText === 'Recovered after the MCP error.',
        `Iteration ${iteration}: stream stopped before the final model response`,
      );
    }

    assert(
      mcpTransport.esqlCallCount === iterations,
      `Expected ${iterations} failing MCP calls, received ${mcpTransport.esqlCallCount}`,
    );
    assert(
      mcpTransport.listIndicesCallCount === iterations,
      `Expected ${iterations} successful follow-up MCP calls, received ${mcpTransport.listIndicesCallCount}`,
    );

    console.log(
      `PASS: ${iterations} MCP JSON-RPC errors were followed by correctly processed second tool results in @ai-sdk/react.`,
    );
  } finally {
    await mcpClient.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
