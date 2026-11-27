import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  FX_BUILTIN_TOOL_SPECS,
  FX_BUILTIN_TOOL_SPECS_LIBFX_VERSION,
} from './fx-builtin-tool-specs';
import { FX_BUILTIN_TOOLS } from './fx-builtin-tools';

/*
 * libfx's native addon packages, by platform, as libfx's own `node.js`
 * selects them. On other platforms libfx runs its WebAssembly build, whose
 * strings are not stored as plain text, so the checks against fx's own
 * strings are skipped there.
 */
const LIBFX_NATIVE_PACKAGES = new Map([
  ['darwin-arm64', '@libfx/libfx-darwin-arm64'],
  ['darwin-x64', '@libfx/libfx-darwin-x64'],
  ['linux-arm64', '@libfx/libfx-linux-arm64-gnu'],
  ['linux-x64', '@libfx/libfx-linux-x64-gnu'],
]);

const libfxEntry = fileURLToPath(import.meta.resolve('libfx/node'));
const nativePackage = LIBFX_NATIVE_PACKAGES.get(
  `${process.platform}-${process.arch}`,
);

async function readLibfxVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(join(dirname(libfxEntry), 'package.json'), 'utf8'),
  ) as { version: string };
  return packageJson.version;
}

async function readNativeAddon(): Promise<Buffer> {
  const packageJsonPath = createRequire(libfxEntry).resolve(
    `${nativePackage}/package.json`,
  );
  return readFile(join(dirname(packageJsonPath), 'libfx.node'));
}

function collectDescriptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectDescriptions);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    key === 'description' && typeof entry === 'string'
      ? [entry]
      : collectDescriptions(entry),
  );
}

/*
 * The sentences of fx's shell description that the adapter keeps verbatim.
 */
const KEPT_SHELL_SENTENCES = [
  'Run every command with shell.run.',
  'output_delta is always terminal-safe; unsafe bytes are escaped while full_output_handle retains exact output, so do not run a separate command merely to test output safety or shell usability.',
  "In zsh, quote glob patterns meant for another program (for example '--include=*.zig') because unmatched globs are errors.",
];

describe('FX_BUILTIN_TOOL_SPECS', () => {
  test('mirrors the installed libfx version', async () => {
    expect(FX_BUILTIN_TOOL_SPECS_LIBFX_VERSION).toBe(await readLibfxVersion());
  });

  test('lists the tools in fx advertisement order', () => {
    const order = [
      'read_file',
      'glob_files',
      'grep_files',
      'edit_file',
      'write_file',
      'shell',
    ];
    expect(Object.keys(FX_BUILTIN_TOOL_SPECS)).toEqual(order);
    expect(Object.keys(FX_BUILTIN_TOOLS)).toEqual(order);
  });

  test('keeps the unchanged shell sentences verbatim', () => {
    for (const sentence of KEPT_SHELL_SENTENCES) {
      expect(FX_BUILTIN_TOOL_SPECS.shell.description).toContain(sentence);
    }
  });

  test.skipIf(nativePackage == null)(
    'matches the descriptions in libfx',
    async () => {
      const addon = await readNativeAddon();
      const { shell, ...otherSpecs } = FX_BUILTIN_TOOL_SPECS;
      const copied = [
        ...collectDescriptions(otherSpecs),
        ...collectDescriptions(shell.inputSchema),
        ...KEPT_SHELL_SENTENCES,
      ];
      const missing = copied.filter(text => !addon.includes(text));
      expect(missing).toEqual([]);
    },
  );
});
