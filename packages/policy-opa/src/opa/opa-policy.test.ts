import type { ModelMessage } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import type { PolicyClient } from '../policy-client';
import {
  type DefaultOpaInput,
  opaPolicy,
  optionalOpaPolicy,
} from './opa-policy';
import { stubClient } from './test-helpers';

describe('opaPolicy', () => {
  it('returns a generic ToolApprovalConfiguration that normalizes an allow decision', async () => {
    const client = stubClient({ decision: 'allow' });
    const approval = opaPolicy({ client, path: 'agent/call/decision' });

    if (typeof approval !== 'function') throw new Error('expected generic fn');

    const status = await approval({
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'git',
        input: { args: ['status'] },
        dynamic: false,
      } as never,
      tools: undefined,
      toolsContext: undefined as never,
      runtimeContext: undefined,
      messages: [],
    });

    expect(status).toEqual({ type: 'approved' });
  });

  it('forwards a deny reason from the Rego output', async () => {
    const client = stubClient({
      decision: 'deny',
      reason: 'pushes require approval',
    });
    const approval = opaPolicy({ client, path: 'agent/call/decision' });
    if (typeof approval !== 'function') throw new Error('expected generic fn');

    const status = await approval({
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'git',
        input: { args: ['push'] },
        dynamic: false,
      } as never,
      tools: undefined,
      toolsContext: undefined as never,
      runtimeContext: undefined,
      messages: [],
    });

    expect(status).toEqual({
      type: 'denied',
      reason: 'pushes require approval',
    });
  });

  it('maps requires-approval and forwards its reason', async () => {
    const client = stubClient({
      decision: 'requires-approval',
      reason: 'requires operator review',
    });
    const approval = opaPolicy({ client, path: 'agent/call/decision' });
    if (typeof approval !== 'function') throw new Error('expected generic fn');

    const status = await approval({
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-3',
        toolName: 'kubectl',
        input: { verb: 'delete', resource: 'pod' },
        dynamic: false,
      } as never,
      tools: undefined,
      toolsContext: undefined as never,
      runtimeContext: undefined,
      messages: [],
    });

    expect(status).toEqual({
      type: 'user-approval',
      reason: 'requires operator review',
    });
  });

  it('passes the default OPA input shape', async () => {
    const evaluate = vi.fn(async () => ({ decision: 'allow' }) as never);
    const client: PolicyClient = { evaluate };

    const approval = opaPolicy({ client, path: 'p' });
    if (typeof approval !== 'function') throw new Error('expected generic fn');

    await approval({
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-direct',
        toolName: 'git',
        input: { args: ['push'] },
        dynamic: false,
      } as never,
      tools: undefined,
      toolsContext: undefined as never,
      runtimeContext: { role: 'reviewer' },
      messages: [],
    });

    expect(evaluate).toHaveBeenCalledWith('p', {
      tool: { name: 'git' },
      args: { args: ['push'] },
      messages: [],
      runtimeContext: { role: 'reviewer' },
    });
  });

  it('honors a custom toInput transformer', async () => {
    const evaluate = vi.fn(async () => ({ decision: 'allow' }) as never);
    const client: PolicyClient = { evaluate };

    const approval = opaPolicy({
      client,
      path: 'p',
      toInput: ({ toolCall, runtimeContext }) => ({
        action: toolCall.toolName,
        principal: (runtimeContext as { role?: string } | undefined)?.role,
      }),
    });
    if (typeof approval !== 'function') throw new Error('expected generic fn');

    await approval({
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-4',
        toolName: 'git',
        input: { args: ['status'] },
        dynamic: false,
      } as never,
      tools: undefined,
      toolsContext: undefined as never,
      runtimeContext: { role: 'reviewer' },
      messages: [],
    });

    expect(evaluate).toHaveBeenCalledWith('p', {
      action: 'git',
      principal: 'reviewer',
    });
  });

  it('fails closed (denies) when the client throws, without rejecting', async () => {
    const client: PolicyClient = {
      async evaluate() {
        throw new Error('OPA unreachable');
      },
    };
    const approval = opaPolicy({ client, path: 'agent/call/decision' });
    if (typeof approval !== 'function') throw new Error('expected generic fn');

    const status = await approval({
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-err',
        toolName: 'git',
        input: { args: ['push'] },
        dynamic: false,
      } as never,
      tools: undefined,
      toolsContext: undefined as never,
      runtimeContext: undefined,
      messages: [],
    });

    expect(status).toMatchObject({ type: 'denied' });
    expect((status as { reason: string }).reason).toContain('OPA unreachable');
  });

  it('serializes a non-Error throw into the deny reason', async () => {
    const client: PolicyClient = {
      async evaluate() {
        throw { code: 'ERR_TIMEOUT' };
      },
    };
    const approval = opaPolicy({ client, path: 'agent/call/decision' });
    if (typeof approval !== 'function') throw new Error('expected generic fn');

    const status = await approval({
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-err',
        toolName: 'git',
        input: {},
        dynamic: false,
      } as never,
      tools: undefined,
      toolsContext: undefined as never,
      runtimeContext: undefined,
      messages: [],
    });

    expect(status).toMatchObject({ type: 'denied' });
    expect((status as { reason: string }).reason).toContain('ERR_TIMEOUT');
  });
});

describe('opaPolicy with several tool calls in one response', () => {
  const messages = (): ModelMessage[] => [
    { role: 'user', content: 'perform the requested actions' },
  ];

  function approve(
    approval: ReturnType<typeof opaPolicy>,
    toolCall: { toolCallId: string; toolName: string; input: unknown },
    callMessages: ModelMessage[],
  ) {
    if (typeof approval !== 'function') throw new Error('expected generic fn');

    return approval({
      toolCall: { type: 'tool-call', dynamic: false, ...toolCall } as never,
      tools: undefined,
      toolsContext: undefined as never,
      runtimeContext: undefined,
      messages: callMessages,
    });
  }

  const charge = (toolCallId: string, amount: number) => ({
    toolCallId,
    toolName: 'charge',
    input: { amount },
  });

  /**
   * Stands in for a Rego rule over `input.messages`: the sum of all `charge`
   * tool calls in the conversation, optionally without the denied ones.
   */
  function chargedAmount(
    input: DefaultOpaInput,
    { skipDenied = false }: { skipDenied?: boolean } = {},
  ): number {
    const deniedToolCallIds = new Set<string>();
    for (const message of input.messages) {
      if (message.role !== 'tool') continue;
      for (const part of message.content) {
        if (
          part.type === 'tool-result' &&
          part.output.type === 'execution-denied'
        ) {
          deniedToolCallIds.add(part.toolCallId);
        }
      }
    }

    let total = 0;
    for (const message of input.messages) {
      if (message.role !== 'assistant' || typeof message.content === 'string') {
        continue;
      }
      for (const part of message.content) {
        if (
          part.type === 'tool-call' &&
          part.toolName === 'charge' &&
          !(skipDenied && deniedToolCallIds.has(part.toolCallId))
        ) {
          total += (part.input as { amount: number }).amount;
        }
      }
    }
    return total;
  }

  /** Allows charges while the conversation total stays within `ceiling`. */
  function budgetPolicy(
    ceiling: number,
    options?: { skipDenied?: boolean },
  ): PolicyClient['evaluate'] {
    return vi.fn(async (_path: string, input: unknown) => {
      const opaInput = input as DefaultOpaInput;
      const amount = (opaInput.args as { amount: number }).amount;
      return (
        chargedAmount(opaInput, options) + amount <= ceiling
          ? { decision: 'allow' }
          : { decision: 'deny', reason: 'conversation budget exceeded' }
      ) as never;
    }) as never;
  }

  const evaluatedMessages = (evaluate: PolicyClient['evaluate']) =>
    vi
      .mocked(evaluate)
      .mock.calls.map(([, input]) => (input as DefaultOpaInput).messages);

  it('evaluates a later tool call again with the earlier tool calls appended', async () => {
    const evaluate = vi.fn(async () => ({ decision: 'allow' }) as never);
    const approval = opaPolicy({ client: { evaluate }, path: 'p' });
    const responseMessages = messages();

    await approve(approval, charge('call-1', 60), responseMessages);
    await approve(approval, charge('call-2', 60), responseMessages);

    expect(evaluatedMessages(evaluate)).toEqual([
      responseMessages,
      responseMessages,
      [
        ...responseMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'charge',
              input: { amount: 60 },
            },
          ],
        },
      ],
    ]);
  });

  it('denies a tool call that exceeds a limit together with earlier tool calls', async () => {
    const approval = opaPolicy({
      client: { evaluate: budgetPolicy(100) },
      path: 'p',
    });
    const responseMessages = messages();

    expect([
      await approve(approval, charge('call-1', 60), responseMessages),
      await approve(approval, charge('call-2', 60), responseMessages),
    ]).toEqual([
      { type: 'approved' },
      { type: 'denied', reason: 'conversation budget exceeded' },
    ]);
  });

  it('appends an execution-denied result for earlier tool calls that were denied', async () => {
    const evaluate = budgetPolicy(100);
    const approval = opaPolicy({ client: { evaluate }, path: 'p' });
    const responseMessages = messages();

    await approve(approval, charge('call-1', 60), responseMessages);
    await approve(approval, charge('call-2', 60), responseMessages);
    await approve(approval, charge('call-3', 30), responseMessages);

    expect(evaluatedMessages(evaluate).at(-1)).toEqual([
      ...responseMessages,
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'charge',
            input: { amount: 60 },
          },
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'charge',
            input: { amount: 60 },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-2',
            toolName: 'charge',
            output: {
              type: 'execution-denied',
              reason: 'conversation budget exceeded',
            },
          },
        ],
      },
    ]);
  });

  it('does not approve a tool call because of an earlier tool call that has not run', async () => {
    // "protectedAction is allowed only after attest": the attest call of the
    // same response has not run when protectedAction is evaluated.
    const evaluate = vi.fn(async (_path: string, input: unknown) => {
      const opaInput = input as DefaultOpaInput;
      const attested = opaInput.messages.some(
        message =>
          message.role === 'assistant' &&
          typeof message.content !== 'string' &&
          message.content.some(
            part => part.type === 'tool-call' && part.toolName === 'attest',
          ),
      );
      return (
        opaInput.tool.name === 'attest' || attested
          ? { decision: 'allow' }
          : { decision: 'deny', reason: 'attest first' }
      ) as never;
    });
    const approval = opaPolicy({ client: { evaluate }, path: 'p' });
    const responseMessages = messages();

    expect([
      await approve(
        approval,
        { toolCallId: 'call-1', toolName: 'attest', input: {} },
        responseMessages,
      ),
      await approve(
        approval,
        { toolCallId: 'call-2', toolName: 'protectedAction', input: {} },
        responseMessages,
      ),
    ]).toEqual([
      { type: 'approved' },
      { type: 'denied', reason: 'attest first' },
    ]);

    // The denial stands, so the policy is not evaluated a third time.
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('requires user approval when only the evaluation with earlier tool calls asks for it', async () => {
    const evaluate = vi.fn(
      async (_path: string, input: unknown) =>
        (chargedAmount(input as DefaultOpaInput) === 0
          ? { decision: 'allow' }
          : {
              decision: 'requires-approval',
              reason: 'second charge',
            }) as never,
    );
    const approval = opaPolicy({ client: { evaluate }, path: 'p' });
    const responseMessages = messages();

    expect([
      await approve(approval, charge('call-1', 60), responseMessages),
      await approve(approval, charge('call-2', 60), responseMessages),
    ]).toEqual([
      { type: 'approved' },
      { type: 'user-approval', reason: 'second charge' },
    ]);
  });

  it('denies when the evaluation with earlier tool calls fails', async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ decision: 'allow' })
      .mockResolvedValueOnce({ decision: 'allow' })
      .mockRejectedValueOnce(new Error('OPA unreachable'));
    const approval = opaPolicy({ client: { evaluate }, path: 'p' });
    const responseMessages = messages();

    await approve(approval, charge('call-1', 60), responseMessages);

    expect(
      await approve(approval, charge('call-2', 60), responseMessages),
    ).toEqual({
      type: 'denied',
      reason: 'policy evaluation failed: OPA unreachable',
    });
  });

  it('evaluates tool calls of different responses independently', async () => {
    const evaluate = budgetPolicy(100);
    const approval = opaPolicy({ client: { evaluate }, path: 'p' });

    expect([
      await approve(approval, charge('call-1', 60), messages()),
      await approve(approval, charge('call-2', 60), messages()),
    ]).toEqual([{ type: 'approved' }, { type: 'approved' }]);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('counts an earlier tool call whose ID a completed tool call already used', async () => {
    // Some providers number the tool calls of every response from zero.
    const approval = opaPolicy({
      client: { evaluate: budgetPolicy(100) },
      path: 'p',
    });
    const conversation: ModelMessage[] = [
      ...messages(),
      {
        role: 'assistant',
        content: [{ type: 'tool-call', ...charge('call-0', 60) }],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-0',
            toolName: 'charge',
            output: { type: 'text', value: 'ok' },
          },
        ],
      },
    ];

    expect([
      await approve(approval, charge('call-0', 30), conversation),
      await approve(approval, charge('call-1', 30), conversation),
    ]).toEqual([
      { type: 'approved' },
      { type: 'denied', reason: 'conversation budget exceeded' },
    ]);
  });

  it('counts earlier tool calls when a response repeats a completed response', async () => {
    const approval = opaPolicy({
      client: { evaluate: budgetPolicy(100) },
      path: 'p',
    });
    const conversation: ModelMessage[] = [
      ...messages(),
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', ...charge('call-0', 30) },
          { type: 'tool-call', ...charge('call-1', 30) },
        ],
      },
      {
        role: 'tool',
        content: ['call-0', 'call-1'].map(toolCallId => ({
          type: 'tool-result' as const,
          toolCallId,
          toolName: 'charge',
          output: { type: 'text' as const, value: 'ok' },
        })),
      },
    ];

    expect([
      await approve(approval, charge('call-0', 30), conversation),
      await approve(approval, charge('call-1', 30), conversation),
    ]).toEqual([
      { type: 'approved' },
      { type: 'denied', reason: 'conversation budget exceeded' },
    ]);
  });

  it('counts an earlier tool call whose ID an unanswered tool call already used', async () => {
    // The user did not answer the approval request for `call-0` and sent a
    // new message instead.
    const approval = opaPolicy({
      client: { evaluate: budgetPolicy(100) },
      path: 'p',
    });
    const conversation: ModelMessage[] = [
      ...messages(),
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', ...charge('call-0', 1) },
          {
            type: 'tool-approval-request',
            approvalId: 'approval-0',
            toolCallId: 'call-0',
          },
        ],
      },
      { role: 'user', content: 'charge 99 twice instead' },
    ];

    expect([
      await approve(approval, charge('call-0', 99), conversation),
      await approve(approval, charge('call-1', 99), conversation),
    ]).toEqual([
      { type: 'approved' },
      { type: 'denied', reason: 'conversation budget exceeded' },
    ]);
  });

  it('counts an earlier tool call whose ID an approved tool call without a result already used', async () => {
    // The messages end with the approval of `call-0`, and the SDK added no
    // result for it. The tool calls of the new response are new objects.
    const approval = opaPolicy({
      client: { evaluate: budgetPolicy(100) },
      path: 'p',
    });
    const conversation: ModelMessage[] = [
      ...messages(),
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', ...charge('call-0', 1) },
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
          },
        ],
      },
    ];

    expect([
      await approve(approval, charge('call-0', 60), conversation),
      await approve(approval, charge('call-1', 60), conversation),
    ]).toEqual([
      { type: 'approved' },
      { type: 'denied', reason: 'conversation budget exceeded' },
    ]);
  });

  it('evaluates once when the tool call is one of the tool calls in the messages', async () => {
    // The SDK checks tool calls that a user approved once more before it runs
    // them. It passes the tool calls of the conversation, and the messages
    // include the response with those tool calls.
    const evaluate = vi.fn(async () => ({ decision: 'allow' }) as never);
    const approval = opaPolicy({ client: { evaluate }, path: 'p' });
    const firstToolCall = charge('call-1', 60);
    const secondToolCall = charge('call-2', 60);
    const conversation: ModelMessage[] = [
      ...messages(),
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', ...firstToolCall },
          { type: 'tool-call', ...secondToolCall },
          {
            type: 'tool-approval-request',
            approvalId: 'approval-1',
            toolCallId: 'call-1',
          },
          {
            type: 'tool-approval-request',
            approvalId: 'approval-2',
            toolCallId: 'call-2',
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: 'approval-1',
            approved: true,
          },
          {
            type: 'tool-approval-response',
            approvalId: 'approval-2',
            approved: true,
          },
        ],
      },
    ];

    await approve(approval, firstToolCall, conversation);
    await approve(approval, secondToolCall, conversation);

    expect(evaluatedMessages(evaluate)).toEqual([conversation, conversation]);
  });

  it('passes the earlier tool calls to a custom toInput', async () => {
    const evaluate = vi.fn(
      async (_path: string, _input: unknown) =>
        ({ decision: 'allow' }) as never,
    );
    const approval = opaPolicy({
      client: { evaluate },
      path: 'p',
      toInput: ({ toolCall, messages: inputMessages }) => ({
        action: toolCall.toolName,
        messageCount: inputMessages.length,
      }),
    });
    const responseMessages = messages();

    await approve(approval, charge('call-1', 60), responseMessages);
    await approve(approval, charge('call-2', 60), responseMessages);

    expect(evaluate.mock.calls.map(([, input]) => input)).toEqual([
      { action: 'charge', messageCount: 1 },
      { action: 'charge', messageCount: 1 },
      { action: 'charge', messageCount: 2 },
    ]);
  });

  it('evaluates once when a custom toInput does not depend on the messages', async () => {
    const evaluate = vi.fn(async () => ({ decision: 'allow' }) as never);
    const approval = opaPolicy({
      client: { evaluate },
      path: 'p',
      toInput: ({ toolCall }) => ({ action: toolCall.toolName }),
    });
    const responseMessages = messages();

    await approve(approval, charge('call-1', 60), responseMessages);
    await approve(approval, charge('call-2', 60), responseMessages);

    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('evaluates in call order when the decisions are requested at the same time', async () => {
    // The second charge is denied. The third one fits the budget only when
    // the policy already knows that: 60 + 30 instead of 60 + 60 + 30.
    const budget = budgetPolicy(100, { skipDenied: true });
    const evaluate = vi.fn(async (path: string, input: unknown) => {
      // Later tool calls answer faster than earlier ones.
      const amount = ((input as DefaultOpaInput).args as { amount: number })
        .amount;
      await new Promise(resolve => setTimeout(resolve, amount / 10));
      return budget(path, input);
    });
    const approval = opaPolicy({
      client: { evaluate: evaluate as never },
      path: 'p',
    });
    const responseMessages = messages();

    expect(
      await Promise.all([
        approve(approval, charge('call-1', 60), responseMessages),
        approve(approval, charge('call-2', 60), responseMessages),
        approve(approval, charge('call-3', 30), responseMessages),
      ]),
    ).toEqual([
      { type: 'approved' },
      { type: 'denied', reason: 'conversation budget exceeded' },
      { type: 'approved' },
    ]);
  });

  it('keeps evaluating later tool calls after an evaluation rejected', async () => {
    const evaluate = budgetPolicy(100);
    const approval = opaPolicy({
      client: { evaluate },
      path: 'p',
      toInput: ({ toolCall, runtimeContext, messages: inputMessages }) => {
        if (toolCall.toolCallId === 'call-1') throw new Error('toInput failed');
        return {
          tool: { name: toolCall.toolName },
          args: toolCall.input,
          messages: inputMessages,
          runtimeContext,
        } satisfies DefaultOpaInput;
      },
    });
    const responseMessages = messages();

    await expect(
      approve(approval, charge('call-1', 60), responseMessages),
    ).rejects.toThrow('toInput failed');

    // The first tool call has no decision, so it still counts.
    expect(
      await approve(approval, charge('call-2', 60), responseMessages),
    ).toEqual({ type: 'denied', reason: 'conversation budget exceeded' });
  });
});

describe('optionalOpaPolicy', () => {
  it('returns undefined when no client is supplied', () => {
    const approval = optionalOpaPolicy({
      client: undefined,
      path: 'agent/call/decision',
    });
    expect(approval).toBeUndefined();
  });

  it('delegates to opaPolicy when a client is supplied', async () => {
    const client = stubClient({ decision: 'allow' });
    const approval = optionalOpaPolicy({
      client,
      path: 'agent/call/decision',
    });

    if (typeof approval !== 'function') {
      throw new Error('expected generic approval function');
    }

    const status = await approval({
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'git',
        input: { args: ['status'] },
        dynamic: false,
      } as never,
      tools: undefined,
      toolsContext: undefined as never,
      runtimeContext: undefined,
      messages: [],
    });

    expect(status).toEqual({ type: 'approved' });
  });
});
