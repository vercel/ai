import { describe, expect, it } from 'vitest';
import {
  inboundMessageSchema,
  startMessageSchema,
} from './grok-build-bridge-protocol';

describe('grok-build bridge protocol', () => {
  it('accepts a minimal start message', () => {
    const parsed = startMessageSchema.parse({ type: 'start', prompt: 'hi' });
    expect(parsed.type).toBe('start');
  });

  it('accepts grok-specific fields', () => {
    const parsed = startMessageSchema.parse({
      type: 'start',
      prompt: 'hi',
      model: 'grok-build-0.1',
      planMode: true,
      continue: true,
    });
    expect(parsed.model).toBe('grok-build-0.1');
    expect(parsed.planMode).toBe(true);
  });

  it('carries host-defined tools on the start message', () => {
    const parsed = startMessageSchema.parse({
      type: 'start',
      prompt: 'hi',
      tools: [
        {
          name: 'get_weather',
          description: 'Look up the weather',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      ],
    });
    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools?.[0].name).toBe('get_weather');
  });

  it('round-trips permissionMode on the start message', () => {
    const parsed = startMessageSchema.parse({
      type: 'start',
      prompt: 'hi',
      permissionMode: 'allow-all',
    });
    expect(parsed.permissionMode).toBe('allow-all');
  });

  it('discriminates start within the inbound union', () => {
    const parsed = inboundMessageSchema.parse({ type: 'start', prompt: 'hi' });
    expect(parsed.type).toBe('start');
  });
});
