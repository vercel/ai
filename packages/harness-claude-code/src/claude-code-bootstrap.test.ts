import { describe, expect, it } from 'vitest';
import { resolveBridgeAssetUrl } from './claude-code-bootstrap';

describe('resolveBridgeAssetUrl', () => {
  it('resolves bridge assets beside source and bundled modules', () => {
    const sourceModuleUrl = new URL(
      './claude-code-bootstrap.ts',
      import.meta.url,
    );
    const bundledModuleUrl = new URL('../dist/index.js', import.meta.url);

    expect(
      resolveBridgeAssetUrl({
        name: 'package.json',
        moduleUrl: sourceModuleUrl,
      }),
    ).toEqual(new URL('./bridge/package.json', import.meta.url));
    expect(
      resolveBridgeAssetUrl({
        name: 'package.json',
        moduleUrl: bundledModuleUrl,
      }),
    ).toEqual(new URL('../dist/bridge/package.json', import.meta.url));
  });
});
