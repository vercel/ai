import { LanguageModelV3ToolResultOutput } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

describe('LanguageModelV3ToolResultOutput', () => {
  it('allows undefined in json value', () => {
    const output: LanguageModelV3ToolResultOutput = {
      type: 'json',
      value: { a: 'xxx', b: undefined }, // ✅ compiles
    };

    const serialized = JSON.stringify(output.value);
    expect(serialized).toContain('"a":"xxx"');
    expect(serialized).not.toContain('undefined'); // JSON.stringify removes undefined
  });

  it('allows null in json value', () => {
    const output: LanguageModelV3ToolResultOutput = {
      type: 'json',
      value: { a: null },
    };

    expect(JSON.stringify(output.value)).toBe('{"a":null}');
  });
});
