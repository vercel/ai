import { describe, expect, it } from 'vitest';
import {
  buildInterruptOn,
  builtinToolRequiresApproval,
  collectActionRequests,
} from './approvals';

describe('builtinToolRequiresApproval', () => {
  it('never requires approval under allow-all', () => {
    expect(builtinToolRequiresApproval('readonly', 'allow-all')).toBe(false);
    expect(builtinToolRequiresApproval('edit', 'allow-all')).toBe(false);
    expect(builtinToolRequiresApproval('bash', 'allow-all')).toBe(false);
  });

  it('only gates bash under allow-edits', () => {
    expect(builtinToolRequiresApproval('readonly', 'allow-edits')).toBe(false);
    expect(builtinToolRequiresApproval('edit', 'allow-edits')).toBe(false);
    expect(builtinToolRequiresApproval('bash', 'allow-edits')).toBe(true);
  });

  it('gates edit and bash under allow-reads', () => {
    expect(builtinToolRequiresApproval('readonly', 'allow-reads')).toBe(false);
    expect(builtinToolRequiresApproval('edit', 'allow-reads')).toBe(true);
    expect(builtinToolRequiresApproval('bash', 'allow-reads')).toBe(true);
  });
});

describe('buildInterruptOn', () => {
  it('returns undefined when no gating is needed', () => {
    expect(buildInterruptOn(undefined)).toBeUndefined();
    expect(buildInterruptOn('allow-all')).toBeUndefined();
  });

  it('gates only execute under allow-edits', () => {
    expect(buildInterruptOn('allow-edits')).toEqual({
      execute: { allowedDecisions: ['approve', 'reject'] },
    });
  });

  it('gates write, edit, and execute under allow-reads', () => {
    expect(buildInterruptOn('allow-reads')).toEqual({
      write_file: { allowedDecisions: ['approve', 'reject'] },
      edit_file: { allowedDecisions: ['approve', 'reject'] },
      execute: { allowedDecisions: ['approve', 'reject'] },
    });
  });
});

describe('collectActionRequests', () => {
  it('flattens action requests across interrupts and defaults missing args', () => {
    expect(
      collectActionRequests([
        {
          value: {
            actionRequests: [
              { name: 'execute', args: { command: 'rm -rf /' } },
              { name: 'write_file' },
            ],
          },
        },
        { value: { actionRequests: [{ name: 'edit_file', args: { a: 1 } }] } },
      ]),
    ).toEqual([
      { name: 'execute', args: { command: 'rm -rf /' } },
      { name: 'write_file', args: {} },
      { name: 'edit_file', args: { a: 1 } },
    ]);
  });

  it('ignores interrupts without action requests', () => {
    expect(
      collectActionRequests([{ value: undefined }, { value: {} }]),
    ).toEqual([]);
  });
});
