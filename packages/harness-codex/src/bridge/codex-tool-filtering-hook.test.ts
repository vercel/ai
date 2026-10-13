import { describe, expect, it } from 'vitest';
import {
  assertTrustedApplyPatchHook,
  createTrustedApplyPatchHook,
} from './codex-tool-filtering-hook';

describe('trusted Codex apply_patch hook', () => {
  it('merges configured hooks, reserves a distinct trust key, and does not mutate user config', () => {
    const codexConfig = {
      hooks: {
        PreToolUse: [
          { matcher: '^shell$', hooks: [{ type: 'command', command: 'true' }] },
        ],
      },
    };
    const result = createTrustedApplyPatchHook({ codexConfig });
    expect(codexConfig.hooks.PreToolUse).toHaveLength(1);
    expect(result.threadConfig).toEqual({});
    expect(result.key).toContain(':pre_tool_use:1:0');
    expect(result.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.cliOverrides[0]).toContain(result.hash);
    expect(result.cliOverrides[0]).toContain('^apply_patch$');
    expect(result.cliOverrides[1]).toBe('features.hooks=true');
  });

  it('rejects an untrusted hook even when its command matches', () => {
    const hook = createTrustedApplyPatchHook({ codexConfig: {} });
    expect(() =>
      assertTrustedApplyPatchHook({
        hook,
        response: {
          data: [
            {
              hooks: [
                {
                  key: hook.key,
                  eventName: 'preToolUse',
                  handlerType: 'command',
                  command: hook.command,
                  matcher: '^apply_patch$',
                  currentHash: hook.hash,
                  enabled: true,
                  trustStatus: 'untrusted',
                },
              ],
              errors: [],
            },
          ],
        },
      }),
    ).toThrow('did not load the trusted apply_patch filtering hook');
  });
});
