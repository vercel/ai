import assert from 'node:assert/strict';
import {
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from '../../../../packages/harness-deepagents/node_modules/@langchain/core/dist/messages/index.js';
import { FakeChatModel } from '../../../../packages/harness-deepagents/node_modules/@langchain/core/dist/utils/testing/index.js';
import { loadMcpTools } from '../../../../packages/harness-deepagents/node_modules/@langchain/mcp-adapters/dist/index.js';
import { createDeepAgent } from '../../../../packages/harness-deepagents/node_modules/deepagents/dist/index.js';
import type { AgentMiddleware } from '../../../../packages/harness-deepagents/node_modules/langchain/dist/index.js';
import {
  createDeepAgentsStreamEventState,
  createEmitStreamEvent,
  type DeepAgentsStreamEvent,
} from '../../../../packages/harness-deepagents/src/bridge/create-emit-stream-event.js';

const FAILURE_SIGNAL =
  'ISSUE_22415_REPRODUCED: native MCP ToolException aborted the loop and left the announced call unsettled';

async function loadMcpErrorMiddleware(
  mcpToolNames: ReadonlySet<string>,
  abortSignal: AbortSignal,
): Promise<AgentMiddleware | undefined> {
  try {
    const middlewareUrl = new URL(
      '../../../../packages/harness-deepagents/src/bridge/mcp-tool-errors.ts',
      import.meta.url,
    );
    const middlewareModule = (await import(middlewareUrl.href)) as {
      createMcpToolErrorMiddleware(options: {
        mcpToolNames: () => ReadonlySet<string>;
        abortSignal: () => AbortSignal;
      }): AgentMiddleware;
    };
    return middlewareModule.createMcpToolErrorMiddleware({
      mcpToolNames: () => mcpToolNames,
      abortSignal: () => abortSignal,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ERR_MODULE_NOT_FOUND'
    ) {
      return undefined;
    }
    throw error;
  }
}

async function main() {
  let dispatchCount = 0;
  const [mcpTool] = await loadMcpTools(
    'fixture',
    {
      listTools: async () => ({
        tools: [
          {
            name: 'fail',
            description: 'Return a native MCP error',
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
        dispatchCount++;
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

  class DeterministicModel extends FakeChatModel {
    bindTools() {
      return this;
    }

    async _generate(messages: BaseMessage[]) {
      const toolResult = messages
        .slice()
        .reverse()
        .find(message => message instanceof ToolMessage);

      if (toolResult == null) {
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

      assert.equal(toolResult.tool_call_id, 'native-call');
      assert.equal(toolResult.status, 'error');
      assert.match(String(toolResult.content), /fixture failure/);
      return {
        generations: [
          {
            text: 'recovered',
            message: new AIMessage('recovered'),
          },
        ],
      };
    }
  }

  const controller = new AbortController();
  const mcpToolNames = new Set([mcpTool.name]);
  const mcpErrorMiddleware = await loadMcpErrorMiddleware(
    mcpToolNames,
    controller.signal,
  );
  const agent = createDeepAgent({
    model: new DeterministicModel({}),
    tools: [mcpTool],
    ...(mcpErrorMiddleware ? { middleware: [mcpErrorMiddleware] } : {}),
  });

  const nativeEvents: DeepAgentsStreamEvent[] = [];
  const harnessEvents: Array<Record<string, unknown>> = [];
  const translate = createEmitStreamEvent({
    state: createDeepAgentsStreamEventState(),
    configuredModel: undefined,
    hostToolNames: new Set(),
    mcpToolNames,
    abortSignal: controller.signal,
    emit: event => harnessEvents.push(event),
  } as Parameters<typeof createEmitStreamEvent>[0]);

  let loopError: unknown;
  try {
    for await (const event of agent.streamEvents(
      {
        messages: [
          { role: 'user', content: 'Call the failure tool, then recover.' },
        ],
      },
      { version: 'v2', signal: controller.signal },
    )) {
      nativeEvents.push(event);
      translate(event);
    }
  } catch (error) {
    loopError = error;
  }

  const starts = nativeEvents.filter(
    event => event.event === 'on_tool_start' && event.name === mcpTool.name,
  );
  const errors = nativeEvents.filter(
    event => event.event === 'on_tool_error' && event.name === mcpTool.name,
  );
  const results = harnessEvents.filter(
    event => event.type === 'tool-result' && event.dynamic === true,
  );
  const recovered = nativeEvents.some(
    event =>
      event.event === 'on_chat_model_end' &&
      (event.data as { output?: { content?: unknown } } | undefined)?.output
        ?.content === 'recovered',
  );

  const exactReportedFailure =
    loopError instanceof Error &&
    loopError.name === 'ToolException' &&
    loopError.message.includes('fixture failure') &&
    dispatchCount === 1 &&
    starts.length === 1 &&
    errors.length === 1 &&
    results.length === 0 &&
    !recovered;

  if (exactReportedFailure) {
    console.error(FAILURE_SIGNAL);
    process.exitCode = 1;
    return;
  }

  if (loopError != null) throw loopError;
  assert.equal(dispatchCount, 1, 'the MCP tool must dispatch exactly once');
  assert.equal(
    starts.length,
    1,
    'the native tool call must start exactly once',
  );
  assert.equal(errors.length, 1, 'the native MCP failure must be observable');
  assert.equal(results.length, 1, 'the harness call must settle exactly once');
  assert.equal(results[0].toolCallId, starts[0].run_id);
  assert.equal(results[0].isError, true);
  assert.match(String(results[0].result), /fixture failure/);
  assert.equal(recovered, true, 'the model loop must continue after the error');
  console.log('Issue #22415 behavior is fixed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
