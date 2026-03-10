import { describe, it, expect } from 'vitest';
import {
  isMistralModel,
  isMoonshotaiModel,
  normalizeToolCallId,
} from './normalize-tool-call-id';

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
  it('should return the original ID when not a Mistral or Moonshotai model', () => {
    const originalId = 'tooluse_bpe71yCfRu2b5i-nKGDr5g';
    expect(normalizeToolCallId(originalId, false, false)).toBe(originalId);
  });

  it('should extract first 9 alphanumeric characters for Mistral models', () => {
    expect(
      normalizeToolCallId('tooluse_bpe71yCfRu2b5i-nKGDr5g', true, false),
    ).toBe('toolusebp');
  });

  it('should handle IDs with various special characters for Mistral', () => {
    expect(normalizeToolCallId('tool-use_123ABC456', true, false)).toBe(
      'tooluse12',
    );
    expect(normalizeToolCallId('___abc123DEF___', true, false)).toBe(
      'abc123DEF',
    );
  });

  it('should handle IDs that are already alphanumeric for Mistral', () => {
    expect(normalizeToolCallId('abcdefghi', true, false)).toBe('abcdefghi');
    expect(normalizeToolCallId('abc123XYZ', true, false)).toBe('abc123XYZ');
  });

  it('should handle short IDs for Mistral', () => {
    expect(normalizeToolCallId('abc', true, false)).toBe('abc');
    expect(normalizeToolCallId('12345', true, false)).toBe('12345');
  });

  it('should handle IDs with only special characters for Mistral', () => {
    expect(normalizeToolCallId('___---___', true, false)).toBe('');
  });

  it('should produce valid Mistral tool call IDs (9 alphanumeric chars)', () => {
    const normalizedId = normalizeToolCallId(
      'tooluse_bpe71yCfRu2b5i-nKGDr5g',
      true,
      false,
    );
    expect(normalizedId).toMatch(/^[a-zA-Z0-9]{1,9}$/);
  });

  it('should replace colons in Moonshotai tool call IDs', () => {
    expect(normalizeToolCallId('get_weather:0', false, true)).toBe(
      'get_weather_0',
    );
    expect(normalizeToolCallId('web_search:0', false, true)).toBe(
      'web_search_0',
    );
  });

  it('should replace multiple invalid characters for Moonshotai', () => {
    expect(normalizeToolCallId('tool:name:1', false, true)).toBe('tool_name_1');
  });

  it('should preserve valid characters for Moonshotai', () => {
    expect(normalizeToolCallId('tool_name-1', false, true)).toBe('tool_name-1');
  });

  it('should return original ID if already valid for Moonshotai', () => {
    expect(normalizeToolCallId('tooluse_abc123', false, true)).toBe(
      'tooluse_abc123',
    );
  });
});

describe('isMoonshotaiModel', () => {
  it('should return true for moonshotai models', () => {
    expect(isMoonshotaiModel('moonshotai.kimi-k2.5')).toBe(true);
    expect(isMoonshotaiModel('moonshotai.kimi-k2')).toBe(true);
  });

  it('should return false for non-moonshotai models', () => {
    expect(isMoonshotaiModel('anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe(
      false,
    );
    expect(isMoonshotaiModel('mistral.mistral-large-2402-v1:0')).toBe(false);
  });
});
