import assert from 'node:assert/strict';
import {
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import { FakeChatModel } from '@langchain/core/utils/testing';
import { loadMcpTools } from '@langchain/mcp-adapters';
import { createDeepAgent } from 'deepagents';
import { it } from 'vitest';
import {
  createDeepAgentsStreamEventState,
  createEmitStreamEvent,
} from './create-emit-stream-event';
import { createMcpToolErrorMiddleware } from './mcp-tool-errors';

it('recovers a real MCP ToolException in the native Deep Agents loop and emits one correlated result', async () => {
  let calls = 0;
  const [mcpTool] = await loadMcpTools(
    'fixture',
    {
      listTools: async () => ({
        tools: [
          {
            name: 'fail',
            description: 'native failure',
            inputSchema: {
              type: 'object',
              properties: { marker: { type: 'string' } },
              required: ['marker'],
            },
          },
        ],
      }),
      callTool: async (request: {
        name: string;
        arguments: Record<string, unknown>;
      }) => {
        calls++;
        assert.deepEqual(request, {
          name: 'fail',
          arguments: { marker: 'native' },
        });
        return {
          content: [{ type: 'text', text: 'fixture failure' }],
          isError: true,
        };
      },
    } as never,
    { prefixToolNameWithServerName: true },
  );

  class Model extends FakeChatModel {
    bindTools() {
      return this;
    }

    async _generate(messages: BaseMessage[]) {
      const result = messages
        .slice()
        .reverse()
        .find(message => message instanceof ToolMessage);

      if (!result) {
        return {
          generations: [
            {
              text: '',
              message: new AIMessage({
                content: '',
                tool_calls: [
                  {
                    name: mcpTool.name,
                    id: 'native-call',
                    args: { marker: 'native' },
                  },
                ],
              }),
            },
          ],
        };
      }

      assert.equal(result.tool_call_id, 'native-call');
      assert.equal(result.status, 'error');
      assert.equal(typeof result.content, 'string');
      assert.match(String(result.content), /fixture failure/);
      return {
        generations: [
          { text: 'recovered', message: new AIMessage('recovered') },
        ],
      };
    }
  }

  const controller = new AbortController();
  const names = new Set([mcpTool.name]);
  const agent = createDeepAgent({
    model: new Model({}),
    tools: [mcpTool],
    middleware: [
      createMcpToolErrorMiddleware({
        mcpToolNames: () => names,
        abortSignal: () => controller.signal,
      }),
    ],
  });
  const events: StreamEvent[] = [];
  const translated: Array<Record<string, unknown>> = [];
  const translate = createEmitStreamEvent({
    state: createDeepAgentsStreamEventState(),
    configuredModel: undefined,
    hostToolNames: new Set(),
    mcpToolNames: names,
    abortSignal: controller.signal,
    emit: event => translated.push(event),
  });

  for await (const event of agent.streamEvents(
    {
      messages: [
        { role: 'user', content: 'call the failure tool then recover' },
      ],
    },
    { version: 'v2', signal: controller.signal },
  )) {
    events.push(event);
    translate(event);
  }

  assert.equal(calls, 1);
  const toolStarts = events.filter(
    event => event.event === 'on_tool_start' && event.name === mcpTool.name,
  );
  assert.equal(toolStarts.length, 1);
  const results = translated.filter(
    event => event.type === 'tool-result' && !!event.dynamic,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].toolCallId, toolStarts[0].run_id);
  assert.equal(results[0].isError, true);
  assert.match(String(results[0].result), /fixture failure/);
  const final = events
    .slice()
    .reverse()
    .find(event => event.event === 'on_chat_model_end');
  assert.equal(final?.data.output.content, 'recovered');
});
