import { describe, expect, it } from 'vitest';
import { harnessV1BridgeOutboundMessageSchema } from './harness-v1-bridge-protocol';
import { harnessV1StreamPartSchema } from './harness-v1-stream-part';

/*
 * A stream part that is missing from either union is rejected at the sandbox
 * boundary and never reaches the agent — with nothing on the wire to say why.
 * These assertions pin the tool-input parts into both.
 */
describe('tool-input stream parts', () => {
  const parts = [
    {
      type: 'tool-input-start',
      toolCallId: 'c1',
      toolName: 'bash',
      providerExecuted: true,
    },
    { type: 'tool-input-delta', toolCallId: 'c1', delta: '{"command":"ls"}' },
    { type: 'tool-input-end', toolCallId: 'c1' },
  ] as const;

  it.each(parts)('is a member of the stream-part union: $type', part => {
    expect(harnessV1StreamPartSchema.parse(part)).toEqual(part);
  });

  it.each(parts)('is a member of the bridge outbound union: $type', part => {
    expect(harnessV1BridgeOutboundMessageSchema.parse(part)).toEqual(part);
  });

  it('accepts the optional dynamic + providerMetadata fields on the start', () => {
    const part = {
      type: 'tool-input-start',
      toolCallId: 'c1',
      toolName: 'mcp__weather__current',
      providerExecuted: true,
      dynamic: true,
      providerMetadata: { 'claude-code': { nativeName: 'mcp__weather__x' } },
    };
    expect(harnessV1StreamPartSchema.parse(part)).toEqual(part);
  });

  it('rejects a start without a tool name', () => {
    expect(
      harnessV1StreamPartSchema.safeParse({
        type: 'tool-input-start',
        toolCallId: 'c1',
      }).success,
    ).toBe(false);
  });
});
