/**
 * Represents the possible runtime environments where code can execute.
 *
 * - 'vercel-edge': Vercel Edge Runtime environment
 * - 'cloudflare-workers': Cloudflare Workers environment
 * - 'node': Node.js environment
 * - 'browser': Web browser environment
 * - null: Unknown or unsupported runtime environment
 */
export type Runtime =
  | 'vercel-edge'
  | 'cloudflare-workers'
  | 'node'
  | 'browser'
  | null;

/**
 * Detects the current runtime environment by checking for environment-specific globals.
 *
 * @returns {Runtime} A string identifying the runtime environment, or null if the
 *                    runtime cannot be determined or is not one of the supported environments.
 */
export function detectRuntime(): Runtime {
  const globalThisAny = globalThis as any;

  if (globalThisAny.EdgeRuntime) {
    return 'vercel-edge';
  }

  if (globalThis.navigator?.userAgent === 'Cloudflare-Workers') {
    return 'cloudflare-workers';
  }

  if (globalThis.process?.release?.name === 'node') {
    return 'node';
  }

  if (globalThis.window) {
    return 'browser';
  }

  return null;
}
