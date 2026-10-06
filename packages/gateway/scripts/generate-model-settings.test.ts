import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  writeFileSync: vi.fn(),
}));
vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([
  { types: ['evaluation'] },
  { types: ['decision'] },
  { types: ['evaluation', 'decision'] },
  { types: ['decision', 'evaluation'] },
])(
  'writes one decision settings file for catalog types $types',
  async ({ types }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: types.map(type => ({ id: `provider/${type}`, type })),
        }),
      }),
    );

    await import('./generate-model-settings');
    await vi.waitFor(() => expect(execFileSync).toHaveBeenCalledOnce());

    expect(fs.writeFileSync).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('gateway-decision-model-settings.ts'),
      [
        'export type GatewayDecisionModelId =',
        ...types.sort().map(type => `  | 'provider/${type}'`),
        '  | (string & {});',
        '',
      ].join('\n'),
      'utf-8',
    );
  },
);
