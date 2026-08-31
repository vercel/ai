import { readFile } from 'node:fs/promises';

export function createReadBridgeAsset({
  resolveAssetUrl,
}: {
  resolveAssetUrl: (name: string) => URL;
}): (name: string) => Promise<string> {
  return async name => readFile(resolveAssetUrl(name), 'utf8');
}
