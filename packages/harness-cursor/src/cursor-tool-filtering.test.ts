import { describe, expect, it } from 'vitest';
import {
  getCursorBuiltinToolFilteringDenialReason,
  isCursorBuiltinToolIncluded,
  toCursorCommonName,
} from './cursor-tool-filtering';

describe('toCursorCommonName', () => {
  it('maps shell to bash', () => {
    expect(toCursorCommonName('shell')).toBe('bash');
  });

  it('maps list to ls', () => {
    expect(toCursorCommonName('list')).toBe('ls');
  });

  it('passes through unknown names', () => {
    expect(toCursorCommonName('customTool')).toBe('customTool');
  });
});

describe('isCursorBuiltinToolIncluded', () => {
  const hostToolNames = new Set(['weather']);

  it('allows host tools regardless of filtering', () => {
    expect(
      isCursorBuiltinToolIncluded({
        nativeName: 'weather',
        hostToolNames,
        toolFiltering: { mode: 'allow', toolNames: [] },
      }),
    ).toBe(true);
  });

  it('denies inactive built-ins in deny mode', () => {
    expect(
      isCursorBuiltinToolIncluded({
        nativeName: 'shell',
        hostToolNames,
        toolFiltering: { mode: 'deny', toolNames: ['bash'] },
      }),
    ).toBe(false);
  });

  it('allows active built-ins in allow mode', () => {
    expect(
      isCursorBuiltinToolIncluded({
        nativeName: 'read',
        hostToolNames,
        toolFiltering: { mode: 'allow', toolNames: ['read'] },
      }),
    ).toBe(true);
  });

  it('denies built-ins missing from allow mode', () => {
    expect(
      isCursorBuiltinToolIncluded({
        nativeName: 'glob',
        hostToolNames,
        toolFiltering: { mode: 'allow', toolNames: ['read'] },
      }),
    ).toBe(false);
  });
});

describe('getCursorBuiltinToolFilteringDenialReason', () => {
  it('uses the common tool name in the message', () => {
    expect(
      getCursorBuiltinToolFilteringDenialReason({ nativeName: 'shell' }),
    ).toBe(
      "Tool 'bash' is inactive due to the HarnessAgent tool filtering policy.",
    );
  });
});
