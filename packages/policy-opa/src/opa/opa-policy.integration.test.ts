/**
 * End-to-end check that the `toolApproval` wired by `opaPolicy` reaches
 * `generateText` and actually gates tool execution. Unit tests of the
 * adapter functions alone can pass while the SDK wiring is broken, so this
 * suite drives the full path: mock model emits a tool call, the policy
 * decides, `generateText` either runs `tool.execute` or returns an
 * execution-denied result.
 */
import { jsonSchema, type ModelMessage } from '@ai-sdk/provider-utils';
import { generateText, isStepCount, streamText, tool, ToolLoopAgent } from 'ai';
import {
  convertArrayToReadableStream,
  MockLanguageModelV3,
  MockLanguageModelV4,
} from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import type { PolicyClient } from '../policy-client';
import { type DefaultOpaInput, opaPolicy } from './opa-policy';
import { stubClient } from './test-helpers';

const dummyUsage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
} as const;

function modelEmittingOneToolCallThenText() {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      switch (step++) {
        case 0:
          return {
            warnings: [],
            usage: dummyUsage,
            finishReason: { unified: 'tool-calls', raw: undefined },
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'git',
                input: `{ "args": ["push"] }`,
              },
            ],
          };
        default:
          return {
            warnings: [],
            usage: dummyUsage,
            finishReason: { unified: 'stop', raw: 'stop' },
            content: [{ type: 'text', text: 'understood, stopping.' }],
          };
      }
    },
  });
}

describe('opaPolicy end-to-end with generateText', () => {
  it('executes the tool when the policy says allow', async () => {
    const execute = vi.fn(async () => 'ok');

    const result = await generateText({
      model: modelEmittingOneToolCallThenText(),
      prompt: 'do something',
      stopWhen: isStepCount(3),
      tools: {
        git: tool({
          inputSchema: jsonSchema<{ args: string[] }>({
            type: 'object',
            properties: { args: { type: 'array', items: { type: 'string' } } },
            required: ['args'],
          }),
          execute,
        }),
      },
      toolApproval: opaPolicy({
        client: stubClient({ decision: 'allow' }),
        path: 'agent/call/decision',
      }),
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults[0].output).toBe('ok');
  });

  it('skips execution and surfaces the deny reason when the policy says deny', async () => {
    const execute = vi.fn(async () => 'ok');

    const result = await generateText({
      model: modelEmittingOneToolCallThenText(),
      prompt: 'do something',
      stopWhen: isStepCount(3),
      tools: {
        git: tool({
          inputSchema: jsonSchema<{ args: string[] }>({
            type: 'object',
            properties: { args: { type: 'array', items: { type: 'string' } } },
            required: ['args'],
          }),
          execute,
        }),
      },
      toolApproval: opaPolicy({
        client: stubClient({
          decision: 'deny',
          reason: 'pushes require human review',
        }),
        path: 'agent/call/decision',
      }),
    });

    expect(execute).not.toHaveBeenCalled();
    // The tool-role message carries an auto-emitted approval-response with
    // approved: false, followed by a tool-result with type execution-denied
    // that the model receives on its next step.
    const toolMessage = result.responseMessages.find(m => m.role === 'tool') as
      | {
          content: Array<{
            type: string;
            approved?: boolean;
            reason?: string;
            output?: { type: string; reason?: string };
          }>;
        }
      | undefined;
    expect(toolMessage).toBeDefined();

    const approvalResponse = toolMessage!.content.find(
      c => c.type === 'tool-approval-response',
    );
    expect(approvalResponse).toMatchObject({
      approved: false,
      reason: 'pushes require human review',
    });

    const toolResult = toolMessage!.content.find(c => c.type === 'tool-result');
    expect(toolResult?.output).toMatchObject({
      type: 'execution-denied',
      reason: 'pushes require human review',
    });
  });

  it('skips execution when the policy returns an unrecognized decision', async () => {
    const execute = vi.fn(async () => 'ok');

    const result = await generateText({
      model: modelEmittingOneToolCallThenText(),
      prompt: 'do something',
      stopWhen: isStepCount(3),
      tools: {
        git: tool({
          inputSchema: jsonSchema<{ args: string[] }>({
            type: 'object',
            properties: { args: { type: 'array', items: { type: 'string' } } },
            required: ['args'],
          }),
          execute,
        }),
      },
      toolApproval: opaPolicy({
        client: stubClient({ decision: 'blocked' }),
        path: 'agent/call/decision',
      }),
    });

    expect(execute).not.toHaveBeenCalled();
    const toolMessage = result.responseMessages.find(m => m.role === 'tool') as
      | {
          content: Array<{
            type: string;
            output?: { type: string; reason?: string };
          }>;
        }
      | undefined;
    const toolResult = toolMessage?.content.find(c => c.type === 'tool-result');
    expect(toolResult?.output).toEqual({
      type: 'execution-denied',
      reason: 'unrecognized OPA policy decision',
    });
  });

  it('routes a dispatcher call through the same Rego rule via toInput', async () => {
    // Demonstrates the transitive-enforcement pattern documented in the
    // README: bash `'git push'` is rewritten to (kind: 'git', args: ['push'])
    // before reaching the OPA rule, so the same policy fires regardless of
    // whether the model called git directly or routed through bash.
    const evaluate = vi.fn(async (_path: string, input: unknown) => {
      const i = input as { kind: string; args: string[] };
      return i.kind === 'git' && i.args[0] === 'push'
        ? { decision: 'deny', reason: 'pushes denied' }
        : { decision: 'allow' };
    });

    const bashExecute = vi.fn(async () => 'never runs');

    let step = 0;
    const result = await generateText({
      model: new MockLanguageModelV3({
        doGenerate: async () => {
          switch (step++) {
            case 0:
              return {
                warnings: [],
                usage: dummyUsage,
                finishReason: { unified: 'tool-calls', raw: undefined },
                content: [
                  {
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: 'call-1',
                    toolName: 'bash',
                    input: `{ "cmd": "git push origin main" }`,
                  },
                ],
              };
            default:
              return {
                warnings: [],
                usage: dummyUsage,
                finishReason: { unified: 'stop', raw: 'stop' },
                content: [{ type: 'text', text: 'ok' }],
              };
          }
        },
      }),
      prompt: 'do something',
      stopWhen: isStepCount(3),
      tools: {
        bash: tool({
          inputSchema: jsonSchema<{ cmd: string }>({
            type: 'object',
            properties: { cmd: { type: 'string' } },
            required: ['cmd'],
          }),
          execute: bashExecute,
        }),
      },
      toolApproval: opaPolicy({
        client: { evaluate: evaluate as never },
        path: 'agent/action/decision',
        toInput: ({ toolCall }) => {
          const cmd = (toolCall.input as { cmd: string }).cmd;
          const [bin, ...args] = cmd.split(/\s+/);
          return { kind: bin, args };
        },
      }),
    });

    expect(evaluate).toHaveBeenCalledWith('agent/action/decision', {
      kind: 'git',
      args: ['push', 'origin', 'main'],
    });
    expect(bashExecute).not.toHaveBeenCalled();

    const toolMessage = result.responseMessages.find(m => m.role === 'tool') as
      | {
          content: Array<{
            type: string;
            output?: { type: string; reason?: string };
          }>;
        }
      | undefined;
    const toolResult = toolMessage?.content.find(c => c.type === 'tool-result');
    expect(toolResult?.output).toMatchObject({
      type: 'execution-denied',
      reason: 'pushes denied',
    });
  });

  it('fails closed when the backend errors: generation completes, tool is denied', async () => {
    const execute = vi.fn(async () => 'ok');
    const failing: PolicyClient = {
      async evaluate() {
        throw new Error('OPA unreachable');
      },
    };

    const result = await generateText({
      model: modelEmittingOneToolCallThenText(),
      prompt: 'do something',
      stopWhen: isStepCount(3),
      tools: {
        git: tool({
          inputSchema: jsonSchema<{ args: string[] }>({
            type: 'object',
            properties: { args: { type: 'array', items: { type: 'string' } } },
            required: ['args'],
          }),
          execute,
        }),
      },
      toolApproval: opaPolicy({ client: failing, path: 'agent/call/decision' }),
    });

    // The run completes (no abort) and the tool never executed.
    expect(execute).not.toHaveBeenCalled();
    const toolMessage = result.responseMessages.find(m => m.role === 'tool') as
      | { content: Array<{ type: string; output?: { type: string } }> }
      | undefined;
    const toolResult = toolMessage?.content.find(c => c.type === 'tool-result');
    expect(toolResult?.output).toMatchObject({ type: 'execution-denied' });
  });
});

/**
 * A model response can contain several tool calls. The SDK resolves all of
 * their approvals against the conversation before that response, so a rule
 * over the history must also see the earlier tool calls of the same response.
 * These tests run the same tool calls in one response and in successive
 * responses and expect the same outcome.
 */
describe.each(['generateText', 'streamText', 'ToolLoopAgent'] as const)(
  'opaPolicy end-to-end with several tool calls in one response (%s)',
  api => {
    type ToolCall = { toolName: string; input: object };

    const charge = (amount: number): ToolCall => ({
      toolName: 'charge',
      input: { amount },
    });

    /**
     * One inner array is one model response. With `repeatToolCallIds`, every
     * response numbers its tool calls from zero, as some providers do.
     */
    function modelEmittingToolCalls(
      responses: ToolCall[][],
      { repeatToolCallIds = false }: { repeatToolCallIds?: boolean } = {},
    ) {
      let step = 0;

      const nextToolCalls = () => {
        const toolCalls = responses[step] ?? [];
        const prefix = repeatToolCallIds ? 'call' : `call-${step}`;
        step++;
        return toolCalls.map(({ toolName, input }, index) => ({
          type: 'tool-call' as const,
          toolCallId: `${prefix}-${index}`,
          toolName,
          input: JSON.stringify(input),
        }));
      };

      return new MockLanguageModelV4({
        doGenerate: async () => {
          const toolCalls = nextToolCalls();
          return toolCalls.length > 0
            ? {
                warnings: [],
                usage: dummyUsage,
                finishReason: { unified: 'tool-calls', raw: undefined },
                content: toolCalls,
              }
            : {
                warnings: [],
                usage: dummyUsage,
                finishReason: { unified: 'stop', raw: 'stop' },
                content: [{ type: 'text', text: 'done' }],
              };
        },
        doStream: async () => {
          const toolCalls = nextToolCalls();
          return {
            stream: convertArrayToReadableStream([
              { type: 'stream-start' as const, warnings: [] },
              ...(toolCalls.length > 0
                ? toolCalls
                : [
                    { type: 'text-start' as const, id: '1' },
                    { type: 'text-delta' as const, id: '1', delta: 'done' },
                    { type: 'text-end' as const, id: '1' },
                  ]),
              {
                type: 'finish' as const,
                finishReason:
                  toolCalls.length > 0
                    ? { unified: 'tool-calls' as const, raw: undefined }
                    : { unified: 'stop' as const, raw: 'stop' },
                usage: dummyUsage,
              },
            ]),
          };
        },
      });
    }

    /** Names of the tool calls in the history that `input.messages` holds. */
    function toolCallsInHistory(input: DefaultOpaInput) {
      return input.messages.flatMap(message =>
        message.role === 'assistant' && typeof message.content !== 'string'
          ? message.content.flatMap(part =>
              part.type === 'tool-call' ? [part] : [],
            )
          : [],
      );
    }

    async function run({
      responses,
      policy,
      repeatToolCallIds,
      history = [],
      approvePendingToolCalls = false,
    }: {
      responses: ToolCall[][];
      policy: (input: DefaultOpaInput) => unknown;
      repeatToolCallIds?: boolean;
      /** Messages that follow the user message of the conversation. */
      history?: ModelMessage[];
      /** Approve the pending tool calls as a user and call the model again. */
      approvePendingToolCalls?: boolean;
    }) {
      const executed: string[] = [];
      const emptyInput = jsonSchema<object>({ type: 'object', properties: {} });

      const tools = {
        charge: tool({
          inputSchema: jsonSchema<{ amount: number }>({
            type: 'object',
            properties: { amount: { type: 'number' } },
            required: ['amount'],
          }),
          execute: async ({ amount }) => {
            executed.push(`charge(${amount})`);
            return 'ok';
          },
        }),
        attest: tool({
          inputSchema: emptyInput,
          execute: async () => {
            executed.push('attest()');
            return 'ok';
          },
        }),
        protectedAction: tool({
          inputSchema: emptyInput,
          execute: async () => {
            executed.push('protectedAction()');
            return 'ok';
          },
        }),
      };

      const options = {
        model: modelEmittingToolCalls(responses, { repeatToolCallIds }),
        stopWhen: isStepCount(responses.length),
        tools,
        toolApproval: opaPolicy<typeof tools>({
          client: {
            evaluate: async (_path: string, input: unknown) =>
              policy(input as DefaultOpaInput) as never,
          },
          path: 'agent/call/decision',
        }),
      };

      const generate = async (
        callOptions: typeof options,
        messages: ModelMessage[],
      ) => {
        if (api === 'generateText') {
          const result = await generateText({ ...callOptions, messages });
          return {
            content: result.content,
            responseMessages: result.responseMessages,
          };
        }
        if (api === 'streamText') {
          const result = streamText({ ...callOptions, messages });
          await result.consumeStream();
          return {
            content: await result.content,
            responseMessages: await result.responseMessages,
          };
        }
        const result = await new ToolLoopAgent(callOptions).generate({
          messages,
        });
        return {
          content: result.content,
          responseMessages: result.responseMessages,
        };
      };

      const pendingApprovalIds = (
        content: Awaited<ReturnType<typeof generate>>['content'],
      ) =>
        content.flatMap(part =>
          part.type === 'tool-approval-request' && part.isAutomatic !== true
            ? [part.approvalId]
            : [],
        );

      const messages: ModelMessage[] = [
        { role: 'user', content: 'perform the requested actions' },
        ...history,
      ];
      let { content, responseMessages } = await generate(options, messages);

      if (approvePendingToolCalls) {
        ({ content } = await generate(
          {
            ...options,
            model: modelEmittingToolCalls([]),
            stopWhen: isStepCount(1),
          },
          [
            ...messages,
            ...responseMessages,
            {
              role: 'tool',
              content: pendingApprovalIds(content).map(approvalId => ({
                type: 'tool-approval-response',
                approvalId,
                approved: true,
              })),
            },
          ],
        ));
      }

      return {
        executed,
        pendingApprovals: pendingApprovalIds(content).length,
      };
    }

    /** "Charges may total at most 100 per conversation." */
    const budgetPolicy = (input: DefaultOpaInput, ceiling = 100) => {
      const charged = toolCallsInHistory(input)
        .filter(toolCall => toolCall.toolName === 'charge')
        .reduce(
          (total, toolCall) =>
            total + (toolCall.input as { amount: number }).amount,
          0,
        );
      return charged + (input.args as { amount: number }).amount <= ceiling
        ? { decision: 'allow' }
        : { decision: 'deny', reason: 'conversation budget exceeded' };
    };

    /** "A human approves every charge after the first one." */
    const approvalPolicy = (input: DefaultOpaInput) =>
      toolCallsInHistory(input).length === 0
        ? { decision: 'allow' }
        : { decision: 'requires-approval' };

    /** "protectedAction is allowed only after an attest call." */
    const prerequisitePolicy = (input: DefaultOpaInput) =>
      input.tool.name === 'attest' ||
      toolCallsInHistory(input).some(toolCall => toolCall.toolName === 'attest')
        ? { decision: 'allow' }
        : { decision: 'deny', reason: 'attest first' };

    it('enforces a running total across the tool calls of one response', async () => {
      expect(
        await run({
          responses: [[charge(60), charge(60)]],
          policy: budgetPolicy,
        }),
      ).toEqual({ executed: ['charge(60)'], pendingApprovals: 0 });

      expect(
        await run({
          responses: [[charge(40), charge(40), charge(30)]],
          policy: budgetPolicy,
        }),
      ).toEqual({
        executed: ['charge(40)', 'charge(40)'],
        pendingApprovals: 0,
      });
    });

    it('enforces a running total when tool call IDs repeat in every response', async () => {
      expect(
        await run({
          responses: [[charge(60)], [charge(30), charge(30)]],
          policy: budgetPolicy,
          repeatToolCallIds: true,
        }),
      ).toEqual({
        executed: ['charge(60)', 'charge(30)'],
        pendingApprovals: 0,
      });
    });

    it('enforces a running total when a tool call reuses the ID of an approved tool call', async () => {
      // The conversation ends with the approval of a tool call that the
      // provider runs, so the SDK adds no result for it. The new response
      // numbers its tool calls from zero again.
      expect(
        await run({
          history: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-0',
                  toolName: 'providerAction',
                  input: {},
                  providerExecuted: true,
                },
                {
                  type: 'tool-approval-request',
                  approvalId: 'approval-0',
                  toolCallId: 'call-0',
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-approval-response',
                  approvalId: 'approval-0',
                  approved: true,
                  providerExecuted: true,
                },
              ],
            },
          ],
          responses: [[charge(60), charge(60)]],
          policy: input =>
            input.tool.name === 'charge'
              ? budgetPolicy(input)
              : { decision: 'allow' },
          repeatToolCallIds: true,
        }),
      ).toEqual({ executed: ['charge(60)'], pendingApprovals: 0 });
    });

    it('enforces a running total across successive responses', async () => {
      expect(
        await run({
          responses: [[charge(60)], [charge(60)]],
          policy: budgetPolicy,
        }),
      ).toEqual({ executed: ['charge(60)'], pendingApprovals: 0 });
    });

    it('asks for user approval for a later tool call of one response', async () => {
      expect(
        await run({
          responses: [[charge(60), charge(60)]],
          policy: approvalPolicy,
        }),
      ).toEqual({ executed: ['charge(60)'], pendingApprovals: 1 });
    });

    it('runs the tool calls of one response that a user approved', async () => {
      // "Charges above 50 need a human. Charges may total at most 200."
      const policy = (input: DefaultOpaInput) => {
        const amount = (input.args as { amount: number }).amount;
        return budgetPolicy(input, 200).decision === 'deny'
          ? budgetPolicy(input, 200)
          : amount > 50
            ? { decision: 'requires-approval' }
            : { decision: 'allow' };
      };
      const responses = [[charge(60), charge(70)]];

      expect(await run({ responses, policy })).toEqual({
        executed: [],
        pendingApprovals: 2,
      });

      // The SDK evaluates the approved tool calls again before it runs them.
      // The messages then contain both tool calls, which must not be counted
      // a second time: 60 + 70 + 70 fits the budget, 60 + 70 + 60 + 70 would
      // not.
      expect(
        await run({ responses, policy, approvePendingToolCalls: true }),
      ).toEqual({
        executed: ['charge(60)', 'charge(70)'],
        pendingApprovals: 0,
      });
    });

    it('does not let a tool call that has not run satisfy a prerequisite', async () => {
      const attest = { toolName: 'attest', input: {} };
      const protectedAction = { toolName: 'protectedAction', input: {} };

      expect(
        await run({
          responses: [[attest, protectedAction]],
          policy: prerequisitePolicy,
        }),
      ).toEqual({ executed: ['attest()'], pendingApprovals: 0 });

      expect(
        await run({
          responses: [[attest], [protectedAction]],
          policy: prerequisitePolicy,
        }),
      ).toEqual({
        executed: ['attest()', 'protectedAction()'],
        pendingApprovals: 0,
      });
    });
  },
);
