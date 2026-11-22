import { jsonSchema, tool, type ModelMessage } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { opaPolicy, type DefaultOpaInput } from './opa/opa-policy';
import type { PolicyClient } from './policy-client';
import { shadow } from './shadow';
import { wrapMcpTools } from './wrap-mcp-tools';

const dummyTool = (description: string) =>
  tool({
    description,
    inputSchema: jsonSchema<{ arg?: string }>({
      type: 'object',
      properties: { arg: { type: 'string' } },
    }),
    execute: async () => 'ok',
  });

const tools = {
  search: dummyTool('search the docs'),
  createIssue: dummyTool('create a new issue'),
  deleteRepo: dummyTool('delete a repo'),
};

type Tools = typeof tools;

function callGenericApproval(
  toolApproval: unknown,
  toolName: keyof Tools,
): unknown {
  if (typeof toolApproval !== 'function') {
    throw new Error('expected a generic approval function');
  }
  return toolApproval({
    toolCall: {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName,
      input: {},
      dynamic: false,
    } as never,
    tools,
    toolsContext: undefined as never,
    runtimeContext: undefined,
    messages: [],
  });
}

describe('wrapMcpTools', () => {
  describe('function-form approval', () => {
    it('passes the original decision through when the approval matches', async () => {
      const original = async () =>
        ({ type: 'denied', reason: 'no destructive ops' }) as never;
      const { toolApproval } = wrapMcpTools<Tools>(tools, original);

      const status = await callGenericApproval(toolApproval, 'deleteRepo');
      expect(status).toEqual({ type: 'denied', reason: 'no destructive ops' });
    });

    it('falls back to user-approval when the approval returns not-applicable', async () => {
      const original = async () => ({ type: 'not-applicable' }) as never;
      const { toolApproval } = wrapMcpTools<Tools>(tools, original);

      const status = await callGenericApproval(toolApproval, 'search');
      expect(status).toBe('user-approval');
    });

    it('honors the configured default for the fallback case', async () => {
      const original = async () => ({ type: 'not-applicable' }) as never;
      const { toolApproval } = wrapMcpTools<Tools>(tools, original, {
        default: 'denied',
      });

      const status = await callGenericApproval(toolApproval, 'createIssue');
      expect(status).toBe('denied');
    });

    it('treats a string "not-applicable" status as fallback-eligible', async () => {
      const original = async () => 'not-applicable' as never;
      const { toolApproval } = wrapMcpTools<Tools>(tools, original);

      const status = await callGenericApproval(toolApproval, 'search');
      expect(status).toBe('user-approval');
    });

    it('treats undefined as fallback-eligible', async () => {
      const original = async () => undefined as never;
      const { toolApproval } = wrapMcpTools<Tools>(tools, original);

      const status = await callGenericApproval(toolApproval, 'search');
      expect(status).toBe('user-approval');
    });

    it('returns the same tools object reference', () => {
      const result = wrapMcpTools<Tools>(
        tools,
        async () => 'approved' as never,
      );
      expect(result.tools).toBe(tools);
    });
  });

  describe('per-tool-map approval', () => {
    it('preserves explicit per-tool entries', () => {
      const { toolApproval } = wrapMcpTools<Tools>(tools, {
        search: 'approved',
        deleteRepo: { type: 'denied', reason: 'never delete repos' },
      });

      if (typeof toolApproval === 'function') {
        throw new Error('expected per-tool object form');
      }

      expect(toolApproval.search).toBe('approved');
      expect(toolApproval.deleteRepo).toEqual({
        type: 'denied',
        reason: 'never delete repos',
      });
    });

    it('fills in missing tools with the default', () => {
      const { toolApproval } = wrapMcpTools<Tools>(
        tools,
        { search: 'approved' },
        { default: 'user-approval' },
      );

      if (typeof toolApproval === 'function') {
        throw new Error('expected per-tool object form');
      }

      expect(toolApproval.createIssue).toBe('user-approval');
      expect(toolApproval.deleteRepo).toBe('user-approval');
    });

    it('default is user-approval when not specified', () => {
      const { toolApproval } = wrapMcpTools<Tools>(tools, {});

      if (typeof toolApproval === 'function') {
        throw new Error('expected per-tool object form');
      }

      expect(toolApproval.search).toBe('user-approval');
      expect(toolApproval.createIssue).toBe('user-approval');
      expect(toolApproval.deleteRepo).toBe('user-approval');
    });

    it('honors "denied" as a default for hard allowlist mode', () => {
      const { toolApproval } = wrapMcpTools<Tools>(
        tools,
        { search: 'approved' },
        { default: 'denied' },
      );

      if (typeof toolApproval === 'function') {
        throw new Error('expected per-tool object form');
      }

      expect(toolApproval.search).toBe('approved');
      expect(toolApproval.createIssue).toBe('denied');
      expect(toolApproval.deleteRepo).toBe('denied');
    });

    describe('tool names that match inherited object properties', () => {
      // These names resolve to values through `Object.prototype`, so a naive
      // `approval[name]` read would pick up an inherited value instead of
      // undefined and skip the fallback. They must be treated exactly like any
      // other unlisted tool.
      const inheritedTools = {
        constructor: dummyTool('a tool literally named constructor'),
        toString: dummyTool('a tool literally named toString'),
        valueOf: dummyTool('a tool literally named valueOf'),
        unlistedDelete: dummyTool('an ordinary unlisted tool'),
        search: dummyTool('an explicitly listed tool'),
      };
      type InheritedTools = typeof inheritedTools;

      it('applies the "denied" fallback to unlisted inherited-property names', () => {
        const { toolApproval } = wrapMcpTools<InheritedTools>(
          inheritedTools,
          { search: 'approved' } as never,
          { default: 'denied' },
        );

        if (typeof toolApproval === 'function') {
          throw new Error('expected per-tool object form');
        }

        expect(toolApproval.constructor).toBe('denied');
        expect(toolApproval.toString).toBe('denied');
        expect(toolApproval.valueOf).toBe('denied');
        // regression guard: an ordinary unlisted tool still gets the fallback
        expect(toolApproval.unlistedDelete).toBe('denied');
        // an explicitly listed tool keeps its configured decision
        expect(toolApproval.search).toBe('approved');
      });

      it('applies the "user-approval" fallback to unlisted inherited-property names', () => {
        const { toolApproval } = wrapMcpTools<InheritedTools>(
          inheritedTools,
          { search: 'approved' } as never,
          { default: 'user-approval' },
        );

        if (typeof toolApproval === 'function') {
          throw new Error('expected per-tool object form');
        }

        expect(toolApproval.constructor).toBe('user-approval');
        expect(toolApproval.toString).toBe('user-approval');
        expect(toolApproval.valueOf).toBe('user-approval');
        expect(toolApproval.unlistedDelete).toBe('user-approval');
        expect(toolApproval.search).toBe('approved');
      });
    });

    describe('per-tool approval functions', () => {
      // A per-tool approval function that returns a "no opinion" result
      // (`not-applicable`/`undefined`) must fall back to the default, exactly
      // like the generic-function form. Otherwise the tool would resolve to
      // `not-applicable` and run unapproved, defeating the wrapper's purpose.
      it('forces a not-applicable result through the fallback', async () => {
        const { toolApproval } = wrapMcpTools<Tools>(tools, {
          search: (() => ({ type: 'not-applicable' })) as never,
        });

        if (typeof toolApproval === 'function') {
          throw new Error('expected per-tool object form');
        }

        const entry = toolApproval.search;
        if (typeof entry !== 'function') {
          throw new Error('expected wrapped per-tool function');
        }

        const status = await (entry as (...args: unknown[]) => unknown)(
          {},
          {} as never,
        );
        expect(status).toBe('user-approval');
      });

      it('forces an undefined result through the configured default', async () => {
        const { toolApproval } = wrapMcpTools<Tools>(
          tools,
          { search: (() => undefined) as never },
          { default: 'denied' },
        );

        if (typeof toolApproval === 'function') {
          throw new Error('expected per-tool object form');
        }

        const entry = toolApproval.search;
        if (typeof entry !== 'function') {
          throw new Error('expected wrapped per-tool function');
        }

        const status = await (entry as (...args: unknown[]) => unknown)(
          {},
          {} as never,
        );
        expect(status).toBe('denied');
      });

      it('passes a decision through unchanged when the function has an opinion', async () => {
        const decision = { type: 'denied', reason: 'never' };
        const { toolApproval } = wrapMcpTools<Tools>(tools, {
          deleteRepo: (() => decision) as never,
        });

        if (typeof toolApproval === 'function') {
          throw new Error('expected per-tool object form');
        }

        const entry = toolApproval.deleteRepo;
        if (typeof entry !== 'function') {
          throw new Error('expected wrapped per-tool function');
        }

        const status = await (entry as (...args: unknown[]) => unknown)(
          {},
          {} as never,
        );
        expect(status).toEqual(decision);
      });

      it('forwards input and options to the wrapped function', async () => {
        const calls: unknown[][] = [];
        const { toolApproval } = wrapMcpTools<Tools>(tools, {
          search: ((...args: unknown[]) => {
            calls.push(args);
            return 'approved';
          }) as never,
        });

        if (typeof toolApproval === 'function') {
          throw new Error('expected per-tool object form');
        }

        const entry = toolApproval.search as (...args: unknown[]) => unknown;
        const input = { arg: 'value' };
        const options = { toolCallId: 'call-1' };
        await entry(input, options as never);

        expect(calls).toEqual([[input, options]]);
      });
    });
  });
});
describe('wrapMcpTools with an opaPolicy approval', () => {
  // The policy allows `read_config`, never matches `delete_backup` on its own
  // (not-applicable), and asks for approval of `delete_backup` only when the
  // earlier `read_config` call of the same response is part of the messages it
  // sees. This is the shape of a rule that depends on earlier tool calls.
  const client: PolicyClient = {
    async evaluate(_path, input) {
      const { tool: toolIdentifier, messages } = input as DefaultOpaInput;

      if (toolIdentifier.name === 'read_config') {
        return { decision: 'allow' } as never;
      }
      if (toolIdentifier.name !== 'delete_backup') return null as never;

      const hasReadConfig = messages.some(
        message =>
          message.role === 'assistant' &&
          Array.isArray(message.content) &&
          message.content.some(
            part =>
              part.type === 'tool-call' && part.toolName === 'read_config',
          ),
      );

      return (
        hasReadConfig
          ? { decision: 'requires-approval', reason: 'delete after read' }
          : null
      ) as never;
    },
  };

  const opaTools = {
    read_config: dummyTool('read the config'),
    delete_backup: dummyTool('delete a backup'),
  };
  type OpaTools = typeof opaTools;

  const readConfigCall = {
    toolCallId: 'call-read',
    toolName: 'read_config',
    input: {},
  };
  const deleteBackupCall = {
    toolCallId: 'call-delete',
    toolName: 'delete_backup',
    input: { arg: 'b1' },
  };

  async function decide(
    approval: unknown,
    toolCall: { toolCallId: string; toolName: string; input: unknown },
    messages: ModelMessage[],
  ): Promise<unknown> {
    if (typeof approval !== 'function') {
      throw new Error('expected a generic approval function');
    }
    return await (approval as (args: unknown) => unknown)({
      toolCall: { type: 'tool-call', ...toolCall, dynamic: false },
      tools: opaTools,
      toolsContext: undefined,
      runtimeContext: undefined,
      messages,
    });
  }

  // The SDK decides on all tool calls of a response before it runs any of
  // them, with the same `messages` array for each call.
  async function decideResponse(approval: unknown) {
    const messages: ModelMessage[] = [];
    const statuses: unknown[] = [];
    for (const toolCall of [readConfigCall, deleteBackupCall]) {
      statuses.push(await decide(approval, toolCall, messages));
    }
    return statuses;
  }

  it('denies a not-applicable call in hard allowlist mode when the evaluation with the sibling asks for approval', async () => {
    const { toolApproval } = wrapMcpTools<OpaTools>(
      opaTools,
      opaPolicy({ client, path: 'agent/call/decision' }),
      { default: 'denied' },
    );

    expect(await decideResponse(toolApproval)).toEqual([
      { type: 'approved' },
      // Without the fallback, the evaluation with the earlier `read_config`
      // call would turn this into `user-approval` and make it approvable.
      'denied',
    ]);
  });

  it('keeps the user-approval default fallback', async () => {
    const { toolApproval } = wrapMcpTools<OpaTools>(
      opaTools,
      opaPolicy({ client, path: 'agent/call/decision' }),
    );

    expect(await decideResponse(toolApproval)).toEqual([
      { type: 'approved' },
      { type: 'user-approval', reason: 'delete after read' },
    ]);
  });

  it('keeps the approved fallback', async () => {
    const { toolApproval } = wrapMcpTools<OpaTools>(
      opaTools,
      opaPolicy({ client, path: 'agent/call/decision' }),
      { default: 'approved' },
    );

    expect(await decideResponse(toolApproval)).toEqual([
      { type: 'approved' },
      { type: 'user-approval', reason: 'delete after read' },
    ]);
  });

  it('applies the fallback to a call without sibling calls', async () => {
    const { toolApproval } = wrapMcpTools<OpaTools>(
      opaTools,
      opaPolicy({ client, path: 'agent/call/decision' }),
      { default: 'denied' },
    );

    expect(await decide(toolApproval, deleteBackupCall, [])).toBe('denied');
  });

  it('applies the fallback per evaluation to per-tool approval functions', async () => {
    const policy = opaPolicy({ client, path: 'agent/call/decision' });
    const { toolApproval } = wrapMcpTools<OpaTools>(
      opaTools,
      { read_config: policy as never, delete_backup: policy as never },
      { default: 'denied' },
    );

    if (typeof toolApproval === 'function') {
      throw new Error('expected per-tool object form');
    }

    const messages: ModelMessage[] = [];
    const readEntry = toolApproval.read_config as (
      ...args: unknown[]
    ) => unknown;
    const deleteEntry = toolApproval.delete_backup as (
      ...args: unknown[]
    ) => unknown;

    expect([
      await readEntry(readConfigCall.input, {
        toolCallId: 'call-read',
        messages,
        toolContext: undefined,
        runtimeContext: undefined,
      }),
      await deleteEntry(deleteBackupCall.input, {
        toolCallId: 'call-delete',
        messages,
        toolContext: undefined,
        runtimeContext: undefined,
      }),
    ]).toEqual([{ type: 'approved' }, 'denied']);
  });

  // The SDK checks a tool call that a user approved once more before it runs,
  // with the messages that contain the response and its approval, so there is
  // a single evaluation. The fallback applies to it as well.
  describe('re-evaluation from messages', () => {
    function messagesWithCalls(
      calls: Array<{ toolCallId: string; toolName: string; input: unknown }>,
    ): ModelMessage[] {
      return [
        { role: 'user', content: 'go' },
        {
          role: 'assistant',
          content: calls.map(call => ({
            type: 'tool-call' as const,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            input: call.input,
          })),
        },
      ];
    }

    it('denies a re-evaluation the policy does not match in hard allowlist mode', async () => {
      const { toolApproval } = wrapMcpTools<OpaTools>(
        opaTools,
        opaPolicy({ client, path: 'agent/call/decision' }),
        { default: 'denied' },
      );

      // `isToolCallFromMessages` compares the input by identity.
      const input = deleteBackupCall.input;
      const messages = messagesWithCalls([{ ...deleteBackupCall, input }]);

      expect(
        await decide(toolApproval, { ...deleteBackupCall, input }, messages),
      ).toBe('denied');
    });

    it('keeps a user-approval request of a re-evaluation that matches', async () => {
      const { toolApproval } = wrapMcpTools<OpaTools>(
        opaTools,
        opaPolicy({ client, path: 'agent/call/decision' }),
        { default: 'denied' },
      );

      const input = deleteBackupCall.input;
      const messages = messagesWithCalls([
        readConfigCall,
        { ...deleteBackupCall, input },
      ]);

      expect(
        await decide(toolApproval, { ...deleteBackupCall, input }, messages),
      ).toEqual({ type: 'user-approval', reason: 'delete after read' });
    });
  });

  it('keeps the default fallback for per-tool approval functions', async () => {
    const policy = opaPolicy({ client, path: 'agent/call/decision' });
    const { toolApproval } = wrapMcpTools<OpaTools>(opaTools, {
      read_config: policy as never,
      delete_backup: policy as never,
    });

    if (typeof toolApproval === 'function') {
      throw new Error('expected per-tool object form');
    }

    const messages: ModelMessage[] = [];
    const readEntry = toolApproval.read_config as (
      ...args: unknown[]
    ) => unknown;
    const deleteEntry = toolApproval.delete_backup as (
      ...args: unknown[]
    ) => unknown;

    expect([
      await readEntry(readConfigCall.input, {
        toolCallId: 'call-read',
        messages,
        toolContext: undefined,
        runtimeContext: undefined,
      }),
      await deleteEntry(deleteBackupCall.input, {
        toolCallId: 'call-delete',
        messages,
        toolContext: undefined,
        runtimeContext: undefined,
      }),
    ]).toEqual([
      { type: 'approved' },
      { type: 'user-approval', reason: 'delete after read' },
    ]);
  });

  it('applies the fallback per evaluation when the policy is in shadow mode', async () => {
    const { toolApproval } = wrapMcpTools<OpaTools>(
      opaTools,
      shadow(opaPolicy({ client, path: 'agent/call/decision' }), {
        enforce: true,
      }),
      { default: 'denied' },
    );

    expect(await decideResponse(toolApproval)).toEqual([
      { type: 'approved' },
      'denied',
    ]);
  });
});
