import {
  createVercelHarnessSandbox as create,
  type VercelHarnessSandbox,
} from '@ai-sdk/sandbox-vercel/harness';

/**
 * Spin up a `VercelHarnessSandbox` for the harness-agent examples. Returns
 * the concrete class so examples can call `.stop()` on it.
 */
export async function createVercelHarnessSandbox(
  options: { port?: number; runtime?: 'node24' } = {},
): Promise<VercelHarnessSandbox> {
  const port = options.port ?? 4000;
  const runtime = options.runtime ?? 'node24';
  return (await create({
    runtime,
    ports: [port],
    timeout: 10 * 60 * 1000,
  })) as VercelHarnessSandbox;
}
