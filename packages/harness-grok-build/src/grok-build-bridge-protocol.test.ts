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
      continue: true,
    });
    expect(parsed.model).toBe('grok-build-0.1');
    expect(parsed.continue).toBe(true);
  });

  it('discriminates start within the inbound union', () => {
    const parsed = inboundMessageSchema.parse({ type: 'start', prompt: 'hi' });
    expect(parsed.type).toBe('start');
  });
});
