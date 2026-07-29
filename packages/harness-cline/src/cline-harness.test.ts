import { describe, expect, it } from 'vitest';
import { cline, createCline } from './index';
import {
  resolveActiveClineBuiltinNames,
  CLINE_NATIVE_BUILTIN_NAMES,
} from './cline-tools';

describe('createCline', () => {
  it('returns a harness-v1 spec', () => {
    const harness = createCline();
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.harnessId).toBe('cline');
    expect(harness.supportsBuiltinToolApprovals).toBe(true);
    expect(harness.supportsBuiltinToolFiltering).toBe(true);
  });

  it('declares the seven built-in tools', () => {
    expect(Object.keys(createCline().builtinTools).sort()).toEqual(
      [...CLINE_NATIVE_BUILTIN_NAMES].sort(),
    );
  });

  it('exports a default instance', () => {
    expect(cline.harnessId).toBe('cline');
  });

  it('validates lifecycle state data with its schema', () => {
    const schema = createCline().lifecycleStateSchema;
    expect(schema).toBeDefined();
  });
});

describe('resolveActiveClineBuiltinNames', () => {
  it('returns all built-ins without filtering', () => {
    expect(resolveActiveClineBuiltinNames(undefined)).toEqual(
      CLINE_NATIVE_BUILTIN_NAMES,
    );
  });

  it('applies allow filtering', () => {
    expect(
      resolveActiveClineBuiltinNames({
        mode: 'allow',
        toolNames: ['read', 'grep'],
      }),
    ).toEqual(['read', 'grep']);
  });

  it('applies deny filtering', () => {
    expect(
      resolveActiveClineBuiltinNames({ mode: 'deny', toolNames: ['bash'] }),
    ).toEqual(['read', 'write', 'edit', 'grep', 'glob', 'ls']);
  });
});
