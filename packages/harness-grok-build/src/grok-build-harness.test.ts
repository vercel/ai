import { describe, expect, it } from 'vitest';
import { GROK_BUILD_BUILTIN_TOOLS, toCommonName } from './grok-build-harness';

describe('grok-build builtin tools', () => {
  it('exposes common tool names', () => {
    expect(Object.keys(GROK_BUILD_BUILTIN_TOOLS)).toEqual(
      expect.arrayContaining(['read', 'write', 'edit', 'bash']),
    );
  });

  it('maps a native name to its common name', () => {
    expect(toCommonName('Read')).toBe('read');
  });

  it('passes through unknown native names unchanged', () => {
    expect(toCommonName('SomeGrokSpecificTool')).toBe('SomeGrokSpecificTool');
  });
});
