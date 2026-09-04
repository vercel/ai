import { describe, it, expect } from 'vitest';
import { isMistralModel, normalizeToolCallId } from './normalize-tool-call-id';

describe('isMistralModel', () => {
  it('should return true for mistral models', () => {
    expect(isMistralModel('mistral.mistral-7b-instruct-v0:2')).toBe(true);
    expect(isMistralModel('mistral.mixtral-8x7b-instruct-v0:1')).toBe(true);
    expect(isMistralModel('mistral.mistral-large-2402-v1:0')).toBe(true);
    expect(isMistralModel('mistral.mistral-small-2402-v1:0')).toBe(true);
    expect(isMistralModel('mistral.mistral-large-2407-v1:0')).toBe(true);
    expect(isMistralModel('mistral.ministral-3-14b-instruct')).toBe(true);
    expect(isMistralModel('mistral.ministral-3-8b-instruct')).toBe(true);
  });

  it('should return true for region-prefixed mistral models', () => {
    expect(isMistralModel('us.mistral.pixtral-large-2502-v1:0')).toBe(true);
    expect(isMistralModel('eu.mistral.mistral-large-2407-v1:0')).toBe(true);
  });

  it('should return false for non-mistral models', () => {
    expect(isMistralModel('anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe(
      false,
    );
    expect(isMistralModel('amazon.nova-pro-v1:0')).toBe(false);
    expect(isMistralModel('openai.gpt-4o')).toBe(false);
    expect(isMistralModel('meta.llama3-70b-instruct-v1:0')).toBe(false);
  });
});

describe('normalizeToolCallId', () => {
  it('should return the original ID when not a Mistral model', () => {
    const originalId = 'tooluse_bpe71yCfRu2b5i-nKGDr5g';
    expect(normalizeToolCallId(originalId, false)).toBe(originalId);
  });

  it('should always produce exactly 9 alphanumeric characters for Mistral models', () => {
    const inputs = [
      'tooluse_bpe71yCfRu2b5i-nKGDr5g',
      'tool-use_123ABC456',
      'abc',
      '12345',
      '___---___',
      '',
    ];
    for (const input of inputs) {
      expect(normalizeToolCallId(input, true)).toMatch(/^[a-zA-Z0-9]{9}$/);
    }
  });

  it('should be deterministic', () => {
    const id = 'tooluse_bpe71yCfRu2b5i-nKGDr5g';
    expect(normalizeToolCallId(id, true)).toBe('6VmclqrqY');
    expect(normalizeToolCallId(id, true)).toBe(normalizeToolCallId(id, true));
  });

  it('should not collide for distinct Bedrock IDs that share the first 9 alphanumeric characters', () => {
    // Regression test: both of these start with the constant `tooluse` prefix
    // plus `Ac`, so first-9-character truncation maps both to `tooluseAc`,
    // producing duplicate toolUse IDs that Bedrock rejects with
    // `ValidationException: ... contain duplicate Ids`.
    const a = normalizeToolCallId('tooluse_Ac1Xq9ZklmNoPq', true);
    const b = normalizeToolCallId('tooluse_Ac2Yt7WrstUvWx', true);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-zA-Z0-9]{9}$/);
    expect(b).toMatch(/^[a-zA-Z0-9]{9}$/);
  });

  it('should return already-normalized (9 alphanumeric char) IDs unchanged', () => {
    // A normalized ID is returned to the caller, persisted, and re-normalized
    // when the request is rebuilt; round-tripping must be stable so a tool call
    // and its tool result keep the same ID.
    expect(normalizeToolCallId('abcdefghi', true)).toBe('abcdefghi');
    expect(normalizeToolCallId('abc123XYZ', true)).toBe('abc123XYZ');
    expect(normalizeToolCallId('___abc123DEF___', true)).toBe('abc123DEF');
  });

  it('should map short IDs to exactly 9 characters', () => {
    expect(normalizeToolCallId('abc', true)).toBe('naOMmDqz3');
    expect(normalizeToolCallId('12345', true)).toBe('dt6dDZQCF');
  });

  it('should map IDs with only special characters to exactly 9 characters', () => {
    expect(normalizeToolCallId('___---___', true)).toBe('riTOazhtd');
  });
});
