import type { FetchFunction } from './fetch-function';
import { isNodeRuntime } from './is-node-runtime';

// Selected at build time so portable bundles never resolve Node dependencies.
export async function getDefaultDownloadFetch(): Promise<FetchFunction> {
  if (isNodeRuntime()) {
    throw new Error(
      "The @ai-sdk/provider-utils portable build cannot perform protected downloads in Node.js. To preserve DNS protection, configure your bundler to select the 'node' export condition (for example, platform: 'node' in esbuild or exportConditions: ['node'] in @rollup/plugin-node-resolve).",
    );
  }

  return globalThis.fetch;
}
