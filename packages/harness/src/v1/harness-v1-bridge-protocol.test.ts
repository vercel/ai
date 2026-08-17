import { describe, expect, it } from 'vitest';
import { harnessV1BridgeResponseFormatSchema } from './harness-v1-bridge-protocol';

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
