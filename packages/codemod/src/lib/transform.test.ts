import { execSync } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { transform } from './transform';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('transform reports', () => {
  it.each([true, false])(
    'preserves manual migration guidance when logStatus is %s',
    logStatus => {
      const output = [
        'Processing 1 files...',
        ' REP /project/fixture.ts Migration required:',
        ' REP /project/fixture.ts   Use provider-specific metadata instead:',
        ' REP /project/fixture.ts     part.providerMetadata?.anthropic?.redactedData',
        'All done.',
        '0 errors',
        '1 skipped',
        '0 ok',
        '',
      ].join('\n');
      vi.mocked(execSync).mockReturnValue(output);
      const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

      const result = transform(
        'v5/replace-redacted-reasoning-type',
        '/project/fixture.ts',
        {},
        { logStatus },
      );

      expect(write).toHaveBeenCalledWith(output);
      expect(result).toEqual({ errors: [], notImplementedErrors: [] });
    },
  );
});
