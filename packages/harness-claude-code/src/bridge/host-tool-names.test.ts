import { describe, expect, test } from 'vitest';
import { resolveHostToolName } from './host-tool-names';

describe('resolveHostToolName', () => {
  const aliases = { weather: 'mcp__harness-tools__weather' };

  test.each(['weather', 'mcp__harness-tools__weather'])(
    'resolves %s to the host tool name',
    toolName => {
      expect(resolveHostToolName(toolName, aliases)).toBe('weather');
    },
  );

  test.each([
    'unknown',
    'Read',
    'mcp__external__weather',
    'toString',
    'constructor',
    '__proto__',
  ])('does not classify %s as a host tool without an alias', toolName => {
    expect(resolveHostToolName(toolName, aliases)).toBeUndefined();
  });

  test('resolves prefixed names without an alias map', () => {
    expect(resolveHostToolName('mcp__harness-tools__weather')).toBe('weather');
    expect(resolveHostToolName('weather')).toBeUndefined();
  });

  test('resolves explicitly registered prototype property names', () => {
    const toolAliases = Object.fromEntries(
      ['toString', 'constructor', '__proto__'].map(name => [
        name,
        `mcp__harness-tools__${name}`,
      ]),
    );
    for (const toolName of Object.keys(toolAliases)) {
      expect(resolveHostToolName(toolName, toolAliases)).toBe(toolName);
    }
  });
});
