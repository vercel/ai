import { describe, expect, it } from 'vitest';
import {
  advisor_20260301,
  advisor_20260301OutputSchema,
} from './advisor_20260301';

describe('advisor_20260301 tool', () => {
  it('creates a provider-executed tool with the expected id', () => {
    const advisor = advisor_20260301({ model: 'claude-opus-4-7' });

    expect(advisor.type).toBe('provider');
    expect(advisor.id).toBe('anthropic.advisor_20260301');
    expect(advisor.isProviderExecuted).toBe(true);
  });

  it('forwards model, maxUses, and caching options as args', () => {
    const advisor = advisor_20260301({
      model: 'claude-opus-4-7',
      maxUses: 3,
      caching: { type: 'ephemeral', ttl: '5m' },
    });

    expect(advisor.args).toEqual({
      model: 'claude-opus-4-7',
      maxUses: 3,
      caching: { type: 'ephemeral', ttl: '5m' },
    });
  });

  it('reports support for deferred results', () => {
    const advisor = advisor_20260301({ model: 'claude-opus-4-7' });

    expect(advisor.supportsDeferredResults).toBe(true);
  });
});

describe('advisor_20260301OutputSchema', () => {
  it('accepts a plaintext advisor_result', async () => {
    const schema = advisor_20260301OutputSchema();
    const result = await schema.validate!({
      type: 'advisor_result',
      text: 'Use a channel-based coordination pattern.',
    });

    expect(result.success).toBe(true);
  });

  it('accepts an advisor_redacted_result', async () => {
    const schema = advisor_20260301OutputSchema();
    const result = await schema.validate!({
      type: 'advisor_redacted_result',
      encryptedContent: 'opaque-blob',
    });

    expect(result.success).toBe(true);
  });

  it('accepts an advisor_tool_result_error', async () => {
    const schema = advisor_20260301OutputSchema();
    const result = await schema.validate!({
      type: 'advisor_tool_result_error',
      errorCode: 'max_uses_exceeded',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown variant', async () => {
    const schema = advisor_20260301OutputSchema();
    const result = await schema.validate!({
      type: 'something_else',
      text: 'nope',
    });

    expect(result.success).toBe(false);
  });
});
