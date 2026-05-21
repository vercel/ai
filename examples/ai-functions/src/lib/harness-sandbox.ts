import { VercelHarnessSandbox } from '@ai-sdk/sandbox-vercel/harness';
import { Sandbox } from '@vercel/sandbox';

/**
 * Spin up a `VercelHarnessSandbox` for the harness-agent examples. Declares
 * one port on the sandbox so the harness adapter has a port to bind the
 * bridge to (it picks `sandbox.ports[0]` automatically).
 */
export async function createVercelHarnessSandbox(
  options: { port?: number; runtime?: 'node24' } = {},
): Promise<VercelHarnessSandbox> {
  const port = options.port ?? 4000;
  const runtime = options.runtime ?? 'node24';
  return new VercelHarnessSandbox(
    await Sandbox.create({
      runtime,
      ports: [port],
      timeout: 10 * 60 * 1000,
    }),
  );
}
