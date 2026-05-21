import type { HarnessV1NetworkPolicy, HarnessV1Sandbox } from '@ai-sdk/harness';
import type { NetworkPolicy } from '@vercel/sandbox';
import { VercelSandbox } from '../src/vercel-sandbox';

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
  async getPortUrl({
    port,
    protocol = 'https',
  }: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<string> {
    const url = this.sandbox.domain(port);
    if (protocol === 'https') return url;
    return url.replace(/^https:\/\//, `${protocol}://`);
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
