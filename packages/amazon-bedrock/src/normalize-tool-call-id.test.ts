import { describe, expect, it } from 'vitest';
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

  it('should hash incompatible IDs deterministically for Mistral models', () => {
    const toolCallId = 'tooluse_bpe71yCfRu2b5i-nKGDr5g';

    expect([
      normalizeToolCallId(toolCallId, true),
      normalizeToolCallId(toolCallId, true),
    ]).toMatchInlineSnapshot(`
      [
        "8eHypBDcw",
        "8eHypBDcw",
      ]
    `);
  });

  it('should produce 9 alphanumeric characters for incompatible IDs', () => {
    const normalizedIds = [
      normalizeToolCallId('tool-use_123ABC456', true),
      normalizeToolCallId('___abc123DEF___', true),
      normalizeToolCallId('abc', true),
      normalizeToolCallId('12345', true),
      normalizeToolCallId('___---___', true),
    ];

    expect(normalizedIds).toMatchInlineSnapshot(`
      [
        "hvVDqPNyj",
        "TnzPqldGU",
        "GRuIyUwcV",
        "PceAgWDYe",
        "5C589HVqG",
      ]
    `);
    for (const normalizedId of normalizedIds) {
      expect(normalizedId).toMatch(/^[a-zA-Z0-9]{9}$/);
    }
  });

  it('should preserve IDs that are already valid Mistral tool call IDs', () => {
    expect(normalizeToolCallId('abcdefghi', true)).toBe('abcdefghi');
    expect(normalizeToolCallId('abc123XYZ', true)).toBe('abc123XYZ');
  });

  it('should keep distinct Bedrock IDs distinct when their prefixes match', () => {
    expect([
      normalizeToolCallId('tooluse_Ac1Xq9ZklmNoPq', true),
      normalizeToolCallId('tooluse_Ac2Yt7WrstUvWx', true),
    ]).toMatchInlineSnapshot(`
      [
        "7rDVWRig0",
        "bNZvZKNBZ",
      ]
    `);
  });
});
