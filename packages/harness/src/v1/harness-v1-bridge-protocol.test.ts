import { describe, expect, it } from 'vitest';
import {
  experimental_harnessV1BridgeUserMessageInboundSchema,
  harnessV1BridgeResponseFormatSchema,
  harnessV1BridgeUserMessageInboundSchema,
} from './harness-v1-bridge-protocol';

describe('harnessV1BridgeResponseFormatSchema', () => {
  it('preserves JSON Schema response formats across the bridge boundary', () => {
    const responseFormat = {
      type: 'json',
      name: 'answer',
      description: 'A structured answer.',
      schema: {
        type: 'object',
        properties: {
          answer: { type: 'string', enum: ['yes', 'no'] },
        },
        required: ['answer'],
        additionalProperties: false,
      },
    } as const;

    expect(harnessV1BridgeResponseFormatSchema.parse(responseFormat)).toEqual(
      responseFormat,
    );
  });
});

describe('harnessV1BridgeUserMessageInboundSchema', () => {
  it('accepts the original user-message payload without a messageId', () => {
    expect(
      harnessV1BridgeUserMessageInboundSchema.parse({
        type: 'user-message',
        text: '/compact',
      }),
    ).toEqual({ type: 'user-message', text: '/compact' });
  });

  it('requires a messageId on the experimental acknowledged payload', () => {
    expect(
      experimental_harnessV1BridgeUserMessageInboundSchema.safeParse({
        type: 'user-message',
        text: 'Change course.',
      }).success,
    ).toBe(false);
    expect(
      experimental_harnessV1BridgeUserMessageInboundSchema.parse({
        type: 'user-message',
        messageId: 'message-1',
        text: 'Change course.',
      }),
    ).toEqual({
      type: 'user-message',
      messageId: 'message-1',
      text: 'Change course.',
    });
  });
});
