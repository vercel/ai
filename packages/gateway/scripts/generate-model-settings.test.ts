import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
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
  'writes decision catalog IDs for upstream types $types',
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
      expect.stringContaining('gateway-model-catalog.ts'),
      expect.stringContaining(
        [
          '  decision: [',
          ...types
            .sort()
            .map(type => `    ${JSON.stringify(`provider/${type}`)},`),
          '  ],',
        ].join('\n'),
      ),
      'utf-8',
    );
  },
);

it('writes extraction catalog IDs for upstream extraction models', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'provider/extract', type: 'extraction' }],
      }),
    }),
  );

  await import('./generate-model-settings');
  await vi.waitFor(() => expect(execFileSync).toHaveBeenCalledOnce());

  expect(fs.writeFileSync).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining('gateway-model-catalog.ts'),
    expect.stringContaining(
      ['  extraction: [', '    "provider/extract",', '  ],'].join('\n'),
    ),
    'utf-8',
  );
});
