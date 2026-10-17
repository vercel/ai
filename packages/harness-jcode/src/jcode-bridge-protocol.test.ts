import { describe, expect, it } from 'vitest';
import {
  jcodeBridgeInboundMessageSchema,
  jcodeBridgeStartMessageSchema,
} from './jcode-bridge-protocol';

describe('Jcode bridge protocol', () => {
  it('accepts Jcode-specific start configuration', () => {
    expect(
      jcodeBridgeStartMessageSchema.parse({
        type: 'start',
        prompt: 'hello',
        model: 'openai:test',
        reasoningEffort: 'high',
        resumeSessionId: 'session-1',
      }),
    ).toMatchObject({
      type: 'start',
      reasoningEffort: 'high',
      resumeSessionId: 'session-1',
    });
  });

  it('accepts shared bridge control commands', () => {
    expect(jcodeBridgeInboundMessageSchema.parse({ type: 'abort' })).toEqual({
      type: 'abort',
    });
    expect(
      jcodeBridgeInboundMessageSchema.parse({
        type: 'tool-result',
        toolCallId: 'call-1',
        output: { temperature: 21 },
        isError: false,
      }),
    ).toMatchObject({ type: 'tool-result', toolCallId: 'call-1' });
  });
});
