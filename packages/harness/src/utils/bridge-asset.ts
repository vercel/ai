import { readFile } from 'node:fs/promises';

export function createReadBridgeAsset<
  const ASSET_URLS extends Record<string, URL>,
>(
  assetUrls: ASSET_URLS,
): (name: Extract<keyof ASSET_URLS, string>) => Promise<string> {
  return async name => readFile(assetUrls[name], 'utf8');
}
