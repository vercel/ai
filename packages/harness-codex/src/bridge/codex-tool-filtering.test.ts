import { describe, expect, it } from 'vitest';
import { resolveCodexBuiltinToolPolicy } from './codex-tool-filtering';

describe('Codex built-in tool filtering', () => {
  it('keeps every built-in when no filtering is requested', () => {
    expect(
      resolveCodexBuiltinToolPolicy({
        builtinToolFiltering: undefined,
        webSearch: true,
      }),
    ).toEqual({
      disabled: {
        bash: false,
        webSearch: false,
        apply_patch: false,
        view_image: false,
      },
      disableEnvironments: false,
      denyApplyPatchWithHook: false,
      webSearchMode: 'live',
    });
  });

  it('disables all environment tools without a hook when only host tools are active', () => {
    expect(
      resolveCodexBuiltinToolPolicy({
        builtinToolFiltering: { mode: 'allow', toolNames: [] },
        webSearch: true,
      }),
    ).toEqual({
      disabled: {
        bash: true,
        webSearch: true,
        apply_patch: true,
        view_image: true,
      },
      disableEnvironments: true,
      denyApplyPatchWithHook: false,
      webSearchMode: 'disabled',
    });
  });

  it('uses a hook only when apply_patch must be disabled independently', () => {
    expect(
      resolveCodexBuiltinToolPolicy({
        builtinToolFiltering: {
          mode: 'deny',
          toolNames: ['apply_patch', 'webSearch'],
        },
        webSearch: true,
      }),
    ).toEqual({
      disabled: {
        bash: false,
        webSearch: true,
        apply_patch: true,
        view_image: false,
      },
      disableEnvironments: false,
      denyApplyPatchWithHook: true,
      webSearchMode: 'disabled',
    });
  });

  it('disables bash and view_image individually when apply_patch remains active', () => {
    expect(
      resolveCodexBuiltinToolPolicy({
        builtinToolFiltering: {
          mode: 'allow',
          toolNames: ['apply_patch'],
        },
        webSearch: true,
      }).disableEnvironments,
    ).toBe(false);
  });
});
