import { describe, expect, it } from 'vitest';
import { loadWeatherApprovalFixture } from './__fixtures__/weather-approval-fixture';
import {
  classifyHostToolInputEnvelope,
  isQualifiedHostToolName,
  resolveHostToolCall,
} from './resolve-host-tool-call';

const serverName = 'ai-sdk-harness-tools';
const input = { city: 'Austin' };

describe('classifyHostToolInputEnvelope', () => {
  it.each([
    { rawInput: input, kind: 'none' },
    {
      rawInput: { tool_name: `${serverName}__get_weather` },
      kind: 'deferred-tool',
    },
    {
      rawInput: { tool_name: `${serverName}__get_weather`, tool_input: null },
      kind: 'deferred-tool',
    },
    {
      rawInput: {
        providerIdentifier: serverName,
        toolName: 'get_weather',
        args: input,
      },
      kind: 'provider-tool',
    },
    {
      rawInput: {
        origin: serverName,
        operation: 'get_weather',
        arguments: input,
      },
      kind: 'origin-operation',
    },
    {
      rawInput: { server: serverName, tool: 'get_weather', arguments: input },
      kind: 'server-tool',
    },
    {
      rawInput: {
        tool_name: `${serverName}__get_weather`,
        server: serverName,
        tool: 'get_weather',
        arguments: input,
      },
      kind: 'ambiguous',
    },
    {
      rawInput: {
        providerIdentifier: serverName,
        toolName: 'get_weather',
        ...input,
      },
      kind: 'none',
    },
    {
      rawInput: { origin: serverName, operation: 'get_weather', ...input },
      kind: 'none',
    },
    {
      rawInput: { server: serverName, tool: 'get_weather', ...input },
      kind: 'none',
    },
  ])('classifies $rawInput as $kind', ({ rawInput, kind }) => {
    expect(classifyHostToolInputEnvelope({ rawInput })).toBe(kind);
  });
});

describe('isQualifiedHostToolName', () => {
  it.each([
    `mcp__${serverName}__get_weather`,
    `${serverName}__get_weather`,
    `mcp_${serverName}_get_weather`,
  ])('accepts %s', name => {
    expect(
      isQualifiedHostToolName({ name, serverName, toolName: 'get_weather' }),
    ).toBe(true);
  });
  it.each([
    undefined,
    null,
    'get_weather',
    'mcp__other-server__get_weather',
    `mcp__${serverName}__get_weather_forecast`,
  ])('rejects %j', name => {
    expect(
      isQualifiedHostToolName({ name, serverName, toolName: 'get_weather' }),
    ).toBe(false);
  });
});

describe('resolveHostToolCall', () => {
  it.each(['cursor', 'github-copilot', 'fx'])(
    'resolves the captured %s observation',
    harness => {
      const updates = loadWeatherApprovalFixture({ harness }).filter(
        event => event.type === 'update',
      );
      const calls = updates
        .map(event => {
          const update = event.value;
          if (
            update.sessionUpdate !== 'tool_call' &&
            update.sessionUpdate !== 'tool_call_update'
          )
            return undefined;
          return resolveHostToolCall({
            toolCall: update,
            serverName,
            toolNames: ['get_weather'],
          });
        })
        .filter(call => call != null);
      expect(calls.at(-1)).toMatchInlineSnapshot(`
      {
        "input": {
          "city": "Austin",
        },
        "toolName": "get_weather",
      }
    `);
    },
  );

  it.each([
    { server: serverName, tool: 'get_weather', arguments: input },
    { origin: serverName, operation: 'get_weather', arguments: input },
    { providerIdentifier: serverName, toolName: 'get_weather', args: input },
    { tool_name: `${serverName}__get_weather`, tool_input: input },
  ])(
    'resolves an envelope by fields without a harness identity: %j',
    rawInput => {
      expect(
        resolveHostToolCall({
          toolCall: { toolCallId: 'envelope', rawInput },
          serverName,
          toolNames: ['get_weather'],
        }),
      ).toMatchInlineSnapshot(`
      {
        "input": {
          "city": "Austin",
        },
        "toolName": "get_weather",
      }
    `);
    },
  );

  it.each([
    { tool_name: `${serverName}__get_weather` },
    { tool_name: `${serverName}__get_weather`, tool_input: null },
    { tool_name: `other-server__get_weather`, tool_input: input },
    {
      tool_name: `${serverName}__get_weather`,
      tool_input: input,
      server: serverName,
      tool: 'get_weather',
      arguments: input,
    },
    { server: 'other-server', tool: 'get_weather', arguments: input },
    { server: serverName, tool: 'other-tool', arguments: input },
    { server: serverName, tool: 'get_weather', arguments: null },
  ])('does not resolve an invalid envelope through its title: %j', rawInput => {
    expect(
      resolveHostToolCall({
        toolCall: {
          toolCallId: 'envelope',
          title: `mcp__${serverName}__get_weather`,
          rawInput,
        },
        serverName,
        toolNames: ['get_weather'],
      }),
    ).toBeUndefined();
  });

  it.each([
    { server: serverName, tool: 'get_weather', ...input },
    { origin: serverName, operation: 'get_weather', ...input },
    { providerIdentifier: serverName, toolName: 'get_weather', ...input },
  ])('preserves incidental envelope keys in direct arguments: %j', rawInput => {
    expect(
      resolveHostToolCall({
        toolCall: {
          toolCallId: 'direct',
          name: `mcp__${serverName}__get_weather`,
          rawInput,
        },
        serverName,
        toolNames: ['get_weather'],
      }),
    ).toEqual({ toolName: 'get_weather', input: rawInput });
  });
});
