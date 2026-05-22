import type { HarnessV1NetworkPolicy, HarnessV1Sandbox } from '@ai-sdk/harness';
import { Sandbox, type NetworkPolicy } from '@vercel/sandbox';
import {
  VercelSandbox,
  type VercelSandboxSettings,
} from '../src/vercel-sandbox';

export async function createVercelHarnessSandbox(
  settings: VercelSandboxSettings = {},
): Promise<HarnessV1Sandbox> {
  if ('sandbox' in settings && settings.sandbox) {
    return new VercelHarnessSandbox(settings.sandbox);
  }
  const { sandbox: _ignored, ...createParams } = settings;
  return new VercelHarnessSandbox(
    await Sandbox.create({ ports: [4000], ...createParams }),
  );
}

/**
 * `HarnessV1Sandbox` backed by a `@vercel/sandbox` `Sandbox`. Extends
 * `VercelSandbox` with the optional harness capabilities: `getPortUrl`
 * (powered by `sandbox.domain`) and `setNetworkPolicy` (powered by
 * `sandbox.update({ networkPolicy })`).
 *
 * Ports must be declared in `Sandbox.create({ ports: [...] })` before
 * `getPortUrl` can resolve a URL for them — that lifecycle stays with the
 * caller, same as the base class.
 */
export class VercelHarnessSandbox
  extends VercelSandbox
  implements HarnessV1Sandbox
{
  get ports(): ReadonlyArray<number> {
    return this.sandbox.routes.map(route => route.port);
  }

  async getPortUrl({
    port,
    protocol = 'https',
  }: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<string> {
    const url = new URL(this.sandbox.domain(port));
    const isSecure = url.protocol === 'https:';
    switch (protocol) {
      case 'http':
        url.protocol = isSecure ? 'https:' : 'http:';
        break;
      case 'https':
        url.protocol = 'https:';
        break;
      case 'ws':
        url.protocol = isSecure ? 'wss:' : 'ws:';
        break;
    }
    return url.toString();
  }

  async setNetworkPolicy(policy: HarnessV1NetworkPolicy): Promise<void> {
    await this.sandbox.update({ networkPolicy: toVercelPolicy(policy) });
  }
}

function toVercelPolicy(policy: HarnessV1NetworkPolicy): NetworkPolicy {
  switch (policy.mode) {
    case 'allow-all':
      return 'allow-all';
    case 'deny-all':
      return 'deny-all';
    case 'allowlist':
      return { allow: [...policy.hosts] };
  }
}
