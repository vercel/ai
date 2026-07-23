import { strict as assert } from 'node:assert';
import {
  createMCPClient,
  type JSONRPCMessage,
  type MCPTransport,
} from '@ai-sdk/mcp';
import { Chat } from '@ai-sdk/react';
import { createAgentUIStream, ToolLoopAgent } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';

const iterations = 25;
const secondToolText = 'Found 5 indices: ["logs", "metrics"]';

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
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  readonly toolCalls: string[] = [];
  readonly responses: JSONRPCMessage[] = [];

  async start() {}

  async close() {
    this.onclose?.();
  }

  async send(message: JSONRPCMessage) {
    if (!('method' in message) || !('id' in message)) {
      return;
    }

    const respond = async (response: JSONRPCMessage) => {
      // Alternate between microtask and timer scheduling to exercise the
      // intermittent/timing-sensitive shape reported in the issue.
      if (Number(message.id) % 2 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      } else {
        await Promise.resolve();
      }
      this.responses.push(response);
      this.onmessage?.(response);
    };

    if (message.method === 'initialize') {
      await respond({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2025-11-25',
          serverInfo: { name: 'issue-10731-server', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
      return;
    }

    if (message.method === 'tools/list') {
      await respond({
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

    if (message.method !== 'tools/call') {
      return;
    }

    const name = (message.params as { name?: string } | undefined)?.name;
    assert.ok(name, 'tools/call must include a tool name');
    this.toolCalls.push(name);

    if (name === 'esql') {
      await respond({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32603,
          message: 'HTTP status client error (400 Bad Request)',
        },
      });
      return;
    }

    assert.equal(name, 'list_indices');
    await respond({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text: secondToolText }],
        isError: false,
      },
    });
  }
}

function createModel() {
  let step = 0;

  return new MockLanguageModelV3({
    doStream: async () => {
      step += 1;

      if (step === 1) {
        return {
          stream: convertArrayToReadableStream([
            { type: 'tool-input-start', id: 'call-esql', toolName: 'esql' },
            {
              type: 'tool-input-delta',
              id: 'call-esql',
              delta: '{"query":"FROM logs | LIMIT 5"}',
            },
            { type: 'tool-input-end', id: 'call-esql' },
            {
              type: 'tool-call',
              toolCallId: 'call-esql',
              toolName: 'esql',
              input: '{"query":"FROM logs | LIMIT 5"}',
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
              id: 'call-list',
              toolName: 'list_indices',
            },
            {
              type: 'tool-input-delta',
              id: 'call-list',
              delta: '{"index_pattern":"*"}',
            },
            { type: 'tool-input-end', id: 'call-list' },
            {
              type: 'tool-call',
              toolCallId: 'call-list',
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

      assert.equal(step, 3, 'agent should finish after the second tool result');
      return {
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: 'final-text' },
          {
            type: 'text-delta',
            id: 'final-text',
            delta: 'The second tool result was displayed.',
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

async function runIteration(iteration: number) {
  const mcpTransport = new ErrorThenSuccessMCPTransport();
  const mcpClient = await createMCPClient({
    transport: mcpTransport,
    maxRetries: 0,
  });

  try {
    const agent = new ToolLoopAgent({
      model: createModel(),
      tools: await mcpClient.tools(),
    });

    const chatErrors: Error[] = [];
    const chat = new Chat({
      generateId: () => `iteration-${iteration}`,
      onError: error => chatErrors.push(error),
      transport: {
        sendMessages: async ({ messages, abortSignal }) =>
          createAgentUIStream({
            agent,
            uiMessages: messages,
            abortSignal,
          }),
        reconnectToStream: async () => null,
      },
    });

    await chat.sendMessage({ text: 'Run ES|QL, then list the indices.' });

    const assistant = chat.messages.at(-1);
    assert.equal(assistant?.role, 'assistant');

    const serializedParts = JSON.stringify(assistant.parts);
    const toolParts = assistant.parts.filter(
      part => 'toolCallId' in part,
    ) as Array<{
      toolCallId: string;
      state?: string;
      output?: unknown;
      errorText?: string;
    }>;

    const firstTool = toolParts.find(part => part.toolCallId === 'call-esql');
    const secondTool = toolParts.find(part => part.toolCallId === 'call-list');
    const secondToolOutput = secondTool?.output as
      | { content?: Array<{ type?: string; text?: string }>; isError?: boolean }
      | undefined;

    assert.deepEqual(mcpTransport.toolCalls, ['esql', 'list_indices']);
    assert.ok(
      mcpTransport.responses.some(
        response => 'error' in response && response.error.code === -32603,
      ),
      'the first MCP call must receive the reported JSON-RPC error shape',
    );
    assert.equal(firstTool?.state, 'output-error');
    assert.equal(secondTool?.state, 'output-available');
    assert.equal(secondToolOutput?.content?.[0]?.text, secondToolText);
    assert.equal(secondToolOutput?.isError, false);
    assert.match(serializedParts, /The second tool result was displayed\./);
    assert.equal(chatErrors.length, 0);
    assert.equal(chat.error, undefined);
    assert.equal(chat.status, 'ready');
  } finally {
    await mcpClient.close();
  }
}

async function main() {
  for (let iteration = 1; iteration <= iterations; iteration++) {
    await runIteration(iteration);
  }

  console.log(
    `PASS: ${iterations} iterations processed the MCP error, the second tool result, and the final UI text without a React Chat error.`,
  );
}

main().catch(error => {
  console.error('ISSUE #10731 REPRODUCTION CHECK FAILED:', error);
  process.exitCode = 1;
});
