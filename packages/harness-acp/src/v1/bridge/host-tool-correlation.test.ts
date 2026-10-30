import type { ActiveSessionMessage } from '@agentclientprotocol/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostToolCall } from './host-tool-call-resolver';
import { createHostToolCorrelation } from './host-tool-correlation';
import { createFixtureHostToolCallResolver } from './__fixtures__/fixture-host-tool-call-resolver';
import {
  loadGrokBuildWeatherFixture,
  loadWeatherApprovalFixture,
} from './__fixtures__/weather-approval-fixture';

describe('createHostToolCorrelation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['resolved-update', 'invocation', 'explicit'] as const)(
    'drops buffered Cursor updates after %s suppression with an unmatched candidate',
    async suppression => {
      for (const status of ['completed', 'failed'] as const) {
        for (const finish of ['timeout', 'flush', 'close'] as const) {
          vi.useFakeTimers();
          const { correlation, semantic, raw } = setup({
            hostTools: [{ name: 'get_weather' }],
          });
          const fixture = loadWeatherApprovalFixture({ harness: 'cursor' });
          const first = fixture[0];
          if (
            first.type !== 'update' ||
            first.value.sessionUpdate !== 'tool_call'
          )
            throw new Error('Missing Cursor update.');
          const native = toolUpdate({
            toolCallId: 'native',
            status: 'in_progress',
          });
          const text = update({
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'after native' },
          });
          correlation.update({ message: native });
          correlation.update({
            message: update(first.value),
            rawUpdate: { ...first.value, _meta: { token: 'cursor-token' } },
          });
          correlation.update({ message: text });
          if (suppression === 'resolved-update') {
            for (const event of fixture.slice(1)) {
              if (event.type === 'update')
                correlation.update({ message: update(event.value) });
            }
          } else if (suppression === 'invocation') {
            register({
              correlation,
              token: 'cursor-token',
              toolName: 'get_weather',
              input: { city: 'Austin' },
              order: 1,
            });
          } else {
            correlation.suppressToolCall({
              toolCallId: first.value.toolCallId,
            });
          }
          correlation.update({
            message: update({
              sessionUpdate: 'tool_call_update',
              toolCallId: first.value.toolCallId,
              status,
            }),
          });
          const preservedRaw = [...raw];
          expect(semantic).toMatchInlineSnapshot(`[]`);
          if (finish === 'timeout') await vi.advanceTimersByTimeAsync(2000);
          else if (finish === 'flush') correlation.flush();
          else correlation.close();
          expect(semantic.map(item => item.message)).toEqual([native, text]);
          expect(raw).toEqual(preservedRaw);
          expect(raw).toHaveLength(suppression === 'resolved-update' ? 6 : 4);
          correlation.close();
          vi.useRealTimers();
        }
      }
    },
  );

  it.each(['cursor', 'github-copilot'])(
    'matches the observed %s call independently of permission display titles',
    async harness => {
      vi.useFakeTimers();
      const { correlation } = setup({ hostTools: [{ name: 'get_weather' }] });
      for (const event of loadWeatherApprovalFixture({ harness })) {
        if (event.type === 'update') {
          correlation.update({ message: update(event.value) });
        } else {
          await vi.advanceTimersByTimeAsync(2000);
          for (const title of [
            'Checking the forecast',
            'Weather lookup',
            null,
          ]) {
            for (const name of [
              undefined,
              null,
              'get_weather',
              'mcp__ai-sdk-harness-tools__get_weather',
            ]) {
              expect(
                await correlation.claimHostToolPermission({
                  toolCall: { ...event.value.toolCall, title, name },
                }),
              ).toMatchInlineSnapshot(`
                {
                  "input": {
                    "city": "Austin",
                  },
                  "toolName": "get_weather",
                }
              `);
            }
          }
          expect(
            await correlation.claimHostToolPermission({
              toolCall: { ...event.value.toolCall, rawInput: undefined },
            }),
          ).toMatchInlineSnapshot(`
            {
              "input": {
                "city": "Austin",
              },
              "toolName": "get_weather",
            }
          `);
        }
      }
      correlation.close();
    },
  );

  it('accepts a permission whose own resolution matches the observation', async () => {
    const rawInput = {
      tool_name: 'ai-sdk-harness-tools__get_weather',
      tool_input: { city: 'Austin' },
    };
    const { correlation } = setup({ hostTools: [{ name: 'get_weather' }] });
    for (const event of loadWeatherApprovalFixture({ harness: 'cursor' })) {
      if (event.type === 'update')
        correlation.update({ message: update(event.value) });
      else
        expect(
          await correlation.claimHostToolPermission({
            toolCall: { ...event.value.toolCall, rawInput },
          }),
        ).toMatchInlineSnapshot(`
          {
            "input": {
              "city": "Austin",
            },
            "toolName": "get_weather",
          }
        `);
    }
    correlation.close();
  });

  it('retains use_tool only for an observed deferred envelope', async () => {
    const { correlation } = setup({ hostTools: [{ name: 'get_weather' }] });
    const toolCall = deferredToolPermission({
      toolCallId: 'deferred',
      combinedToolName: 'ai-sdk-harness-tools__get_weather',
      input: { city: 'Austin' },
    });
    correlation.update({
      message: update({
        sessionUpdate: 'tool_call',
        ...toolCall,
        name: 'use_tool',
      }),
    });
    expect(
      await correlation.claimHostToolPermission({
        toolCall: {
          toolCallId: toolCall.toolCallId,
          name: 'use_tool',
          title: 'Checking weather',
        },
      }),
    ).toMatchInlineSnapshot(`
      {
        "input": {
          "city": "Austin",
        },
        "toolName": "get_weather",
      }
    `);
    correlation.close();
  });

  it('accepts explicitly supplied normalized Cursor arguments that match the observation', async () => {
    const { correlation } = setup({ hostTools: [{ name: 'get_weather' }] });
    for (const event of loadWeatherApprovalFixture({ harness: 'cursor' })) {
      if (event.type === 'update')
        correlation.update({ message: update(event.value) });
      else
        expect(
          await correlation.claimHostToolPermission({
            toolCall: { ...event.value.toolCall, rawInput: { city: 'Austin' } },
          }),
        ).toMatchInlineSnapshot(`
          {
            "input": {
              "city": "Austin",
            },
            "toolName": "get_weather",
          }
        `);
    }
    correlation.close();
  });

  it.each(['cursor', 'github-copilot'])(
    'claims the captured %s permission after the buffer expires',
    async harness => {
      vi.useFakeTimers();
      const { correlation, semantic, raw } = setup({
        hostTools: [{ name: 'get_weather' }],
      });
      const fixture = loadWeatherApprovalFixture({ harness });
      for (const event of fixture) {
        if (event.type === 'update')
          correlation.update({ message: update(event.value) });
        else {
          await vi.advanceTimersByTimeAsync(2000);
          expect(semantic).toMatchInlineSnapshot(`[]`);
          expect(
            await correlation.claimHostToolPermission({
              toolCall: event.value.toolCall,
            }),
          ).toMatchInlineSnapshot(`
            {
              "input": {
                "city": "Austin",
              },
              "toolName": "get_weather",
            }
          `);
        }
      }
      expect(raw).toEqual(
        fixture
          .filter(event => event.type === 'update')
          .map(event => event.value),
      );
      expect(semantic).toMatchInlineSnapshot(`[]`);
      correlation.close();
    },
  );

  it.each([
    { rawInput: { city: 'Quito' } },
    { rawInput: null },
    { rawInput: [] },
    { name: 'different_tool' },
    { name: 'mcp__other-server__get_weather' },
    { name: 'use_tool' },
    {
      rawInput: {
        providerIdentifier: 'other-server',
        toolName: 'get_weather',
        args: { city: 'Austin' },
      },
    },
    {
      rawInput: {
        providerIdentifier: 'ai-sdk-harness-tools',
        toolName: 'get_weather_forecast',
        args: { city: 'Austin' },
      },
    },
    {
      rawInput: {
        providerIdentifier: 'ai-sdk-harness-tools',
        toolName: 'get_weather',
        args: null,
      },
    },
    { toolCallId: 'unrelated' },
  ])(
    'rejects a captured Cursor permission with conflicting fields: %j',
    async change => {
      const { correlation } = setup({ hostTools: [{ name: 'get_weather' }] });
      const fixture = loadWeatherApprovalFixture({ harness: 'cursor' });
      for (const event of fixture) {
        if (event.type === 'update')
          correlation.update({ message: update(event.value) });
        else
          expect(
            await correlation.claimHostToolPermission({
              toolCall: { ...event.value.toolCall, ...change },
            }),
          ).toBeUndefined();
      }
      correlation.close();
    },
  );

  it.each(['completed', 'failed', 'cleared-input'] as const)(
    'does not claim a Cursor permission after %s',
    async state => {
      const { correlation } = setup({ hostTools: [{ name: 'get_weather' }] });
      const fixture = loadWeatherApprovalFixture({ harness: 'cursor' });
      for (const event of fixture) {
        if (event.type === 'update')
          correlation.update({ message: update(event.value) });
        else {
          correlation.update({
            message: update({
              sessionUpdate: 'tool_call_update',
              toolCallId: event.value.toolCall.toolCallId,
              ...(state === 'cleared-input'
                ? { rawInput: null }
                : { status: state }),
            }),
          });
          expect(
            await correlation.claimHostToolPermission({
              toolCall: event.value.toolCall,
            }),
          ).toBeUndefined();
        }
      }
      correlation.close();
    },
  );

  it.each(['completed', 'failed'] as const)(
    'does not claim a permission whose own status is %s',
    async status => {
      const { correlation } = setup({ hostTools: [{ name: 'get_weather' }] });
      const fixture = loadWeatherApprovalFixture({ harness: 'github-copilot' });
      for (const event of fixture) {
        if (event.type === 'update')
          correlation.update({ message: update(event.value) });
        else
          expect(
            await correlation.claimHostToolPermission({
              toolCall: {
                ...event.value.toolCall,
                status,
              },
            }),
          ).toBeUndefined();
      }
      correlation.close();
    },
  );

  it('retains omitted fields but replaces explicitly cleared fields', async () => {
    const { correlation } = setup();
    correlation.update({
      message: update({
        sessionUpdate: 'tool_call',
        toolCallId: 'partial',
        title: 'Native tool',
        name: 'native',
        kind: 'read',
        status: 'pending',
        rawInput: { path: 'file' },
        rawOutput: { value: 1 },
        content: [],
        locations: [],
        _meta: { serverName: 'other' },
      }),
    });
    correlation.update({
      message: update({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'partial',
        status: 'in_progress',
      }),
    });
    expect(correlation.getToolCall({ toolCallId: 'partial' }))
      .toMatchInlineSnapshot(`
              {
                "_meta": {
                  "serverName": "other",
                },
                "content": [],
                "kind": "read",
                "locations": [],
                "name": "native",
                "rawInput": {
                  "path": "file",
                },
                "rawOutput": {
                  "value": 1,
                },
                "status": "in_progress",
                "title": "Native tool",
                "toolCallId": "partial",
              }
            `);
    correlation.update({
      message: update({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'partial',
        name: null,
        title: null,
        kind: null,
        content: null,
        locations: null,
        rawInput: null,
        rawOutput: null,
        _meta: null,
      }),
    });
    expect(correlation.getToolCall({ toolCallId: 'partial' }))
      .toMatchInlineSnapshot(`
              {
                "_meta": null,
                "content": undefined,
                "kind": undefined,
                "locations": undefined,
                "name": "native",
                "rawInput": null,
                "rawOutput": null,
                "status": "in_progress",
                "title": "Native tool",
                "toolCallId": "partial",
              }
            `);
    correlation.close();
  });

  it('does not claim an incomplete permission without a same-ID observation', async () => {
    const { correlation } = setup({ hostTools: [{ name: 'get_weather' }] });
    expect(
      await correlation.claimHostToolPermission({
        toolCall: {
          toolCallId: 'unobserved',
          title: 'ai-sdk-harness-tools-get_weather: get_weather',
        },
      }),
    ).toBeUndefined();
    correlation.close();
  });

  it('matches ACP-before-MCP using server, tool, input, and invocation order', async () => {
    const { correlation, semantic, raw } = setup();
    correlation.update({
      message: toolUpdate({
        toolCallId: 'display-1',
        status: 'in_progress',
      }),
      rawUpdate: portableUpdate({
        toolCallId: 'display-1',
        toolName: 'weather',
        input: { unit: 'celsius', city: 'Lima' },
      }),
    });
    expect(semantic).toEqual([]);

    register({
      correlation,
      token: 'accepted-token',
      toolName: 'weather',
      input: { city: 'Lima', unit: 'celsius' },
      order: 1,
    });
    correlation.update({
      message: toolUpdate({
        toolCallId: 'display-1',
        status: 'completed',
        update: true,
      }),
    });

    expect(semantic).toEqual([]);
    expect(raw).toHaveLength(2);
  });

  it('matches MCP-before-ACP using portable evidence', async () => {
    const { correlation, semantic, raw } = setup();
    register({
      correlation,
      token: 'accepted-first',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    correlation.update({
      message: toolUpdate({
        toolCallId: 'display-2',
        status: 'completed',
      }),
      rawUpdate: portableUpdate({
        toolCallId: 'display-2',
        toolName: 'weather',
        input: { city: 'Lima' },
        status: 'completed',
      }),
    });

    expect(semantic).toEqual([]);
    expect(raw).toHaveLength(1);
  });

  it('matches server and tool names nested in metadata with exact input', async () => {
    const { correlation, semantic, raw } = setup();
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'nested-identity',
      status: 'in_progress',
      rawInput: { city: 'Lima' },
      _meta: {
        details: [
          { serverName: 'ai-sdk-harness-tools' },
          { toolName: 'weather' },
        ],
      },
    } as const;
    correlation.update({
      message: toolUpdate({
        toolCallId: 'nested-identity',
        status: 'in_progress',
      }),
      rawUpdate,
    });
    register({
      correlation,
      token: 'nested-identity-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });

    expect(semantic).toEqual([]);
    expect(raw).toEqual([rawUpdate]);
    correlation.close();
  });

  it('matches MCP-before-ACP by a server-qualified direct ACP name and input', async () => {
    const { correlation, semantic, raw } = setup();
    register({
      correlation,
      token: 'direct-name-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'direct-name-call',
      name: 'weather',
      title: 'Opaque display',
      status: 'completed',
      rawInput: { city: 'Lima' },
      _meta: { serverName: 'ai-sdk-harness-tools' },
    } as const;

    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(semantic).toEqual([]);
    expect(raw).toEqual([rawUpdate]);
    expect(correlation.getToolCall({ toolCallId: rawUpdate.toolCallId }))
      .toMatchInlineSnapshot(`
              {
                "_meta": {
                  "serverName": "ai-sdk-harness-tools",
                },
                "name": "weather",
                "rawInput": {
                  "city": "Lima",
                },
                "status": "completed",
                "title": "Opaque display",
                "toolCallId": "direct-name-call",
              }
            `);
  });

  it('matches Cursor MCP updates by provider, tool, and nested args', async () => {
    const { correlation, semantic, raw } = setup();
    register({
      correlation,
      token: 'cursor-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'cursor-mcp-call',
      title: 'ai-sdk-harness-tools: weather',
      kind: 'other',
      status: 'completed',
      rawInput: {
        providerIdentifier: 'ai-sdk-harness-tools',
        toolName: 'weather',
        args: { city: 'Lima' },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(semantic).toEqual([]);
    expect(raw).toEqual([rawUpdate]);
  });

  it('uses an exact result token as the strongest correlation evidence', async () => {
    const { correlation, semantic, raw } = setup();
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'display-3',
      status: 'completed',
      rawOutput: { result: { metadata: 'registered-after-notification' } },
    };
    correlation.update({
      message: toolUpdate({
        toolCallId: 'display-3',
        status: 'completed',
      }),
      rawUpdate,
    });
    register({
      correlation,
      token: 'registered-after-notification',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });

    expect(semantic).toEqual([]);
    expect(raw).toEqual([rawUpdate]);
  });

  it('claims a host permission from the observed combined MCP identity and input', async () => {
    const { correlation, semantic, raw } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const toolCall = {
      toolCallId: 'toolu_01UTvc8ZcXBubKg5RqvTr8mo',
      title: 'mcp__ai-sdk-harness-tools__get_weather',
      kind: 'other',
      status: 'pending',
      rawInput: { city: 'Lima' },
    } as const;
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      ...toolCall,
      _meta: {
        claudeCode: {
          toolName: 'mcp__ai-sdk-harness-tools__get_weather',
        },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(
      await correlation.claimHostToolPermission({
        toolCall,
      }),
    ).toMatchInlineSnapshot(`
          {
            "input": {
              "city": "Lima",
            },
            "toolName": "get_weather",
          }
        `);
    correlation.update({
      message: toolUpdate({
        toolCallId: toolCall.toolCallId,
        status: 'completed',
        update: true,
      }),
    });

    expect(semantic).toEqual([]);
    expect(raw).toHaveLength(2);
  });

  it('claims a host permission before its generic deferred-tool update arrives', async () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const toolCall = deferredToolPermission({
      toolCallId: 'permission-before-update',
      combinedToolName: 'ai-sdk-harness-tools__get_weather',
      input: { city: 'Lima' },
    });

    expect(await correlation.claimHostToolPermission({ toolCall }))
      .toMatchInlineSnapshot(`
        {
          "input": {
            "city": "Lima",
          },
          "toolName": "get_weather",
        }
      `);
  });

  it('claims a host permission with a combined identity nested in metadata', async () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const toolCall = {
      toolCallId: 'nested-permission-identity',
      title: 'Opaque display',
      status: 'pending',
      rawInput: { city: 'Lima' },
      _meta: {
        details: [{ toolName: 'mcp__ai-sdk-harness-tools__get_weather' }],
      },
    } as const;

    expect(await correlation.claimHostToolPermission({ toolCall }))
      .toMatchInlineSnapshot(`
        {
          "input": {
            "city": "Lima",
          },
          "toolName": "get_weather",
        }
      `);
    correlation.close();
  });

  it('does not claim a host permission from an unqualified ACP name', async () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const toolCall = {
      toolCallId: 'direct-name-permission',
      name: 'get_weather',
      status: 'pending',
      rawInput: { city: 'Lima' },
    } as const;

    expect(
      await correlation.claimHostToolPermission({ toolCall }),
    ).toBeUndefined();
  });

  it('claims a direct ACP name when the candidate is server-qualified', async () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const toolCall = {
      toolCallId: 'server-qualified-direct-name',
      name: 'get_weather',
      title: 'Opaque display',
      status: 'pending',
      rawInput: { city: 'Lima' },
      _meta: { serverName: 'ai-sdk-harness-tools' },
    } as const;
    correlation.update({
      message: update({
        sessionUpdate: 'tool_call',
        ...toolCall,
      }),
      rawUpdate: toolCall,
    });

    expect(await correlation.claimHostToolPermission({ toolCall }))
      .toMatchInlineSnapshot(`
        {
          "input": {
            "city": "Lima",
          },
          "toolName": "get_weather",
        }
      `);
  });

  it('suppresses the later update for a permission claimed before the update', async () => {
    const { correlation, semantic, raw } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const toolCall = deferredToolPermission({
      toolCallId: 'later-provider-update',
      combinedToolName: 'ai-sdk-harness-tools__get_weather',
      input: { city: 'Lima' },
    });
    expect(await correlation.claimHostToolPermission({ toolCall }))
      .toMatchInlineSnapshot(`
        {
          "input": {
            "city": "Lima",
          },
          "toolName": "get_weather",
        }
      `);

    const rawUpdate = {
      sessionUpdate: 'tool_call',
      ...toolCall,
      status: 'completed',
      _meta: {
        protocol: {
          toolName: 'use_tool',
        },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(semantic).toEqual([]);
    expect(raw).toEqual([rawUpdate]);
  });

  it('does not claim a deferred-tool permission with different candidate input', async () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    correlation.update({
      message: toolUpdate({
        toolCallId: 'deferred-input-mismatch',
        status: 'in_progress',
      }),
      rawUpdate: portableUpdate({
        toolCallId: 'deferred-input-mismatch',
        toolName: 'get_weather',
        input: { city: 'Lima' },
      }),
    });
    const toolCall = deferredToolPermission({
      toolCallId: 'deferred-input-mismatch',
      combinedToolName: 'ai-sdk-harness-tools__get_weather',
      input: { city: 'Quito' },
    });

    expect(
      await correlation.claimHostToolPermission({ toolCall }),
    ).toBeUndefined();
  });

  it('does not claim combined MCP identity with different input', async () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'toolu_input_mismatch',
      title: 'mcp__ai-sdk-harness-tools__get_weather',
      kind: 'other',
      status: 'pending',
      rawInput: { city: 'Lima' },
      _meta: {
        claudeCode: {
          toolName: 'mcp__ai-sdk-harness-tools__get_weather',
        },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(
      await correlation.claimHostToolPermission({
        toolCall: {
          toolCallId: rawUpdate.toolCallId,
          kind: 'other',
          status: 'pending',
          rawInput: { city: 'Quito' },
        },
      }),
    ).toBeUndefined();
  });

  it('does not claim a tool name suffix from a combined MCP identity', async () => {
    const { correlation } = setup({
      hostTools: [{ name: 'weather' }],
    });
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'toolu_tool_name_suffix',
      title: 'mcp__ai-sdk-harness-tools__get_weather',
      kind: 'other',
      status: 'pending',
      rawInput: { city: 'Lima' },
      _meta: {
        claudeCode: {
          toolName: 'mcp__ai-sdk-harness-tools__get_weather',
        },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(
      await correlation.claimHostToolPermission({
        toolCall: {
          toolCallId: rawUpdate.toolCallId,
          kind: 'other',
          status: 'pending',
          rawInput: rawUpdate.rawInput,
        },
      }),
    ).toBeUndefined();
  });

  it('does not claim a duplicate host tool identity', async () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }, { name: 'get_weather' }],
    });
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'toolu_ambiguous',
      title: 'mcp__ai-sdk-harness-tools__get_weather',
      kind: 'other',
      status: 'pending',
      rawInput: { city: 'Lima' },
      _meta: {
        protocol: {
          toolName: 'mcp__ai-sdk-harness-tools__get_weather',
        },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(
      await correlation.claimHostToolPermission({
        toolCall: {
          toolCallId: rawUpdate.toolCallId,
          kind: 'other',
          status: 'pending',
          rawInput: rawUpdate.rawInput,
        },
      }),
    ).toBeUndefined();
  });

  it('preserves an explicit null raw update', async () => {
    const { correlation, raw } = setup();
    correlation.update({
      message: update({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'message' },
      }),
      rawUpdate: null,
    });

    expect(raw).toEqual([null]);
  });

  it('flushes unmatched candidates in original order after the bound', async () => {
    vi.useFakeTimers();
    const { correlation, semantic, raw } = setup();
    const nativeStart = toolUpdate({
      toolCallId: 'native-1',
      status: 'in_progress',
    });
    const text = update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'after native' },
    });
    const nativeEnd = toolUpdate({
      toolCallId: 'native-1',
      status: 'completed',
      update: true,
    });
    correlation.update({ message: nativeStart });
    correlation.update({ message: text });
    correlation.update({ message: nativeEnd });
    expect(semantic).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);

    expect(semantic.map(item => item.message)).toEqual([
      nativeStart,
      text,
      nativeEnd,
    ]);
    expect(raw).toHaveLength(3);
  });

  it('does not suppress a title-only candidate', async () => {
    vi.useFakeTimers();
    const { correlation, semantic } = setup();
    register({
      correlation,
      token: 'unrelated',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    const candidate = update({
      sessionUpdate: 'tool_call',
      toolCallId: 'title-only',
      title: 'weather',
      status: 'completed',
    });
    correlation.update({ message: candidate });

    await vi.advanceTimersByTimeAsync(1000);

    expect(semantic.map(item => item.message)).toEqual([candidate]);
  });

  it('keeps distinct concurrent invocations separate', async () => {
    const { correlation, semantic, raw } = setup();
    register({
      correlation,
      token: 'lima-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    register({
      correlation,
      token: 'quito-token',
      toolName: 'weather',
      input: { city: 'Quito' },
      order: 2,
    });
    correlation.update({
      message: toolUpdate({ toolCallId: 'quito', status: 'in_progress' }),
      rawUpdate: portableUpdate({
        toolCallId: 'quito',
        toolName: 'weather',
        input: { city: 'Quito' },
      }),
    });
    correlation.update({
      message: toolUpdate({ toolCallId: 'lima', status: 'in_progress' }),
      rawUpdate: portableUpdate({
        toolCallId: 'lima',
        toolName: 'weather',
        input: { city: 'Lima' },
      }),
    });
    correlation.update({
      message: toolUpdate({
        toolCallId: 'quito',
        status: 'completed',
        update: true,
      }),
    });
    correlation.update({
      message: toolUpdate({
        toolCallId: 'lima',
        status: 'completed',
        update: true,
      }),
    });

    expect(semantic).toEqual([]);
    expect(raw).toHaveLength(4);
  });

  it('pairs identical concurrent invocations by FIFO order', async () => {
    const { correlation, semantic, raw } = setup();
    for (const toolCallId of ['first', 'second']) {
      correlation.update({
        message: toolUpdate({ toolCallId, status: 'in_progress' }),
        rawUpdate: portableUpdate({
          toolCallId,
          toolName: 'weather',
          input: { city: 'Lima' },
        }),
      });
    }
    register({
      correlation,
      token: 'first-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    register({
      correlation,
      token: 'second-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 2,
    });
    for (const toolCallId of ['second', 'first']) {
      correlation.update({
        message: toolUpdate({
          toolCallId,
          status: 'completed',
          update: true,
        }),
      });
    }

    expect(semantic).toEqual([]);
    expect(raw).toHaveLength(4);
  });

  it('expires unmatched invocation state conservatively', async () => {
    vi.useFakeTimers();
    const { correlation, semantic } = setup();
    register({
      correlation,
      token: 'expired-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    await vi.advanceTimersByTimeAsync(1000);

    const candidate = toolUpdate({
      toolCallId: 'late-display',
      status: 'completed',
    });
    correlation.update({
      message: candidate,
      rawUpdate: portableUpdate({
        toolCallId: 'late-display',
        toolName: 'weather',
        input: { city: 'Lima' },
        status: 'completed',
      }),
    });
    await vi.advanceTimersByTimeAsync(1000);

    expect(semantic.map(item => item.message)).toEqual([candidate]);
  });

  it('flushes unproven calls on close', async () => {
    const { correlation, semantic, raw } = setup();
    const pending = toolUpdate({
      toolCallId: 'pending',
      status: 'in_progress',
    });
    correlation.update({ message: pending });
    correlation.close();

    expect(semantic.map(item => item.message)).toEqual([pending]);
    expect(raw).toHaveLength(1);
  });

  it('suppresses the captured Grok Build use_tool host tool call', async () => {
    const { correlation, semantic, raw } = setup({
      hostTools: [{ name: 'weather' }],
    });
    for (const event of loadGrokBuildWeatherFixture()) {
      correlation.update({ message: update(event.value) });
    }
    correlation.close();

    expect(semantic).toEqual([]);
    expect(raw).toHaveLength(3);
  });

  it('claims a host permission received while the update resolution is pending', async () => {
    let resolveResolution!: (call: HostToolCall | undefined) => void;
    const resolution = new Promise<HostToolCall | undefined>(resolve => {
      resolveResolution = resolve;
    });
    const semantic: unknown[] = [];
    const correlation = createHostToolCorrelation({
      emitSemanticUpdate: value => semantic.push(value),
      emitRawUpdate: () => {},
      hostToolServerName: 'ai-sdk-harness-tools',
      hostTools: [{ name: 'ping' }],
      hostToolCallResolver: {
        getResolution: async ({ toolCallId }) =>
          toolCallId === 'call-ping' ? resolution : undefined,
        resolveToolCall: async () => undefined,
      },
    });
    correlation.update({
      message: update({
        sessionUpdate: 'tool_call',
        toolCallId: 'call-ping',
        title: 'ai-sdk-harness-tools-ping',
        kind: 'other',
        status: 'pending',
        rawInput: {},
      }),
    });

    const claim = correlation.claimHostToolPermission({
      toolCall: {
        toolCallId: 'call-ping',
        title: 'ping',
        kind: 'other',
        status: 'pending',
        rawInput: {},
      },
    });
    resolveResolution({ toolName: 'ping', input: {} });

    expect(await claim).toEqual({ toolName: 'ping', input: {} });
    correlation.close();
    expect(semantic).toEqual([]);
  });

  it('defers the buffer timeout while a host tool resolution is pending', async () => {
    vi.useFakeTimers();
    const { correlation, semantic } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const [first, second] = loadWeatherApprovalFixture({
      harness: 'cursor',
    }).filter(event => event.type === 'update');
    correlation.update({ message: update(first.value) });
    const hold = correlation.deferFlush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(semantic).toEqual([]);

    correlation.update({ message: update(second.value) });
    hold.release();
    await vi.advanceTimersByTimeAsync(2000);

    expect(semantic).toEqual([]);
    correlation.close();
  });

  it('flushes a deferred buffer timeout once the hold is released', async () => {
    vi.useFakeTimers();
    const { correlation, semantic } = setup();
    const pending = toolUpdate({ toolCallId: 'native', status: 'in_progress' });
    correlation.update({ message: pending });
    const hold = correlation.deferFlush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(semantic).toEqual([]);
    expect(correlation.isToolCallReleased({ toolCallId: 'native' })).toBe(
      false,
    );

    hold.release();

    expect(semantic.map(item => item.message)).toEqual([pending]);
    expect(correlation.isToolCallReleased({ toolCallId: 'native' })).toBe(true);
    correlation.close();
  });
});

function setup({
  hostTools = [{ name: 'weather' }],
}: {
  hostTools?: ReadonlyArray<{ readonly name: string }>;
} = {}) {
  const semantic: Array<{
    message: Extract<ActiveSessionMessage, { kind: 'session_update' }>;
    rawUpdate: unknown;
  }> = [];
  const raw: unknown[] = [];
  const hostToolCallResolver = createFixtureHostToolCallResolver({
    toolNames: hostTools.map(tool => tool.name),
  });
  const baseCorrelation = createHostToolCorrelation({
    emitSemanticUpdate: value => semantic.push(value),
    emitRawUpdate: ({ rawUpdate }) => raw.push(rawUpdate),
    hostToolServerName: 'ai-sdk-harness-tools',
    hostTools,
    hostToolCallResolver,
  });
  /*
   * Mirrors the bridge loop, which records each tool call update right away
   * and applies its host tool resolution once the host has answered.
   */
  const correlation: typeof baseCorrelation = {
    ...baseCorrelation,
    update: ({ message, rawUpdate }) => {
      const value = message.update;
      const isToolUpdate =
        value.sessionUpdate === 'tool_call' ||
        value.sessionUpdate === 'tool_call_update';
      const hostToolCall =
        isToolUpdate &&
        !baseCorrelation.isToolCallReleased({ toolCallId: value.toolCallId })
          ? hostToolCallResolver.resolveUpdateNow({ update: value })
          : undefined;
      baseCorrelation.update({ message, rawUpdate });
      if (isToolUpdate) {
        baseCorrelation.applyHostToolCall({
          toolCallId: value.toolCallId,
          hostToolCall,
        });
      }
    },
  };
  return { correlation, semantic, raw };
}

function register({
  correlation,
  token,
  toolName,
  input,
  order,
}: {
  correlation: ReturnType<typeof createHostToolCorrelation>;
  token: string;
  toolName: string;
  input: Readonly<Record<string, unknown>>;
  order: number;
}): void {
  correlation.registerInvocation({
    token,
    serverName: 'ai-sdk-harness-tools',
    toolName,
    input,
    order,
  });
}

function portableUpdate({
  toolCallId,
  toolName,
  input,
  status = 'in_progress',
}: {
  toolCallId: string;
  toolName: string;
  input: Readonly<Record<string, unknown>>;
  status?: 'in_progress' | 'completed';
}): unknown {
  return {
    sessionUpdate: 'tool_call',
    toolCallId,
    name: toolName,
    status,
    rawInput: {
      origin: 'ai-sdk-harness-tools',
      operation: toolName,
      arguments: input,
    },
  };
}

function deferredToolPermission({
  toolCallId,
  combinedToolName,
  input,
  title = combinedToolName,
}: {
  toolCallId: string;
  combinedToolName: string;
  input: Readonly<Record<string, unknown>>;
  title?: string;
}) {
  return {
    toolCallId,
    title,
    kind: 'other',
    status: 'pending',
    rawInput: {
      variant: 'UseTool',
      tool_name: combinedToolName,
      tool_input: input,
    },
  } as const;
}

function toolUpdate({
  toolCallId,
  status,
  update: isUpdate = false,
}: {
  toolCallId: string;
  status: 'in_progress' | 'completed';
  update?: boolean;
}): Extract<ActiveSessionMessage, { kind: 'session_update' }> {
  return isUpdate
    ? update({
        sessionUpdate: 'tool_call_update',
        toolCallId,
        status,
      })
    : update({
        sessionUpdate: 'tool_call',
        toolCallId,
        title: 'opaque display',
        status,
      });
}

function update(
  value: Extract<ActiveSessionMessage, { kind: 'session_update' }>['update'],
): Extract<ActiveSessionMessage, { kind: 'session_update' }> {
  return {
    kind: 'session_update',
    notification: {
      sessionId: 'session-1',
      update: value,
    },
    update: value,
  };
}
