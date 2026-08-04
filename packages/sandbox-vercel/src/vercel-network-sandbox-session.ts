import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkPolicy,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1RequestTransformation,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type {
  Sandbox,
  NetworkPolicy,
  NetworkPolicyKeyValueMatcher,
  NetworkPolicyMatcher,
  NetworkPolicyRule,
} from '@vercel/sandbox';
import { VercelSandboxSession } from './vercel-sandbox-session';

const VERCEL_PROVIDER_ID = 'vercel-sandbox';

/**
 * `HarnessV1NetworkSandboxSession` backed by a `@vercel/sandbox` `Sandbox`. The
 * provider's `create()` returns one of these. It extends
 * {@link VercelSandboxSession} with the infra surface (ports, lifecycle,
 * network policy). It owns the sandbox's lifecycle only when the provider
 * created it; when the provider was given an existing sandbox, `stop()` and
 * `destroy()` are no-ops (caller retains ownership).
 */
export class VercelNetworkSandboxSession
  extends VercelSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly id: string;
  readonly defaultWorkingDirectory: string;
  private readonly ownsLifecycle: boolean;
  private networkPolicy: NetworkPolicy | undefined;
  private requestTransformations: ReadonlyArray<HarnessV1RequestTransformation> =
    [];

  constructor(input: { sandbox: Sandbox; ownsLifecycle: boolean }) {
    super(input.sandbox);
    this.ownsLifecycle = input.ownsLifecycle;
    this.id = input.sandbox.name;
    this.defaultWorkingDirectory = input.sandbox.currentSession().cwd;
    this.networkPolicy = input.sandbox.networkPolicy;
  }

  get ports(): ReadonlyArray<number> {
    return this.sandbox.routes.map(route => route.port);
  }

  restricted(): SandboxSession {
    return new VercelSandboxSession(this.sandbox);
  }

  getPortUrl = async (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<string> => {
    const exposedPorts = this.ports;
    if (!exposedPorts.includes(options.port)) {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: VERCEL_PROVIDER_ID,
        message: `Port ${options.port} is not exposed on this sandbox. Exposed ports: [${exposedPorts.join(', ')}].`,
      });
    }
    const protocol = options.protocol ?? 'https';
    const url = new URL(this.sandbox.domain(options.port));
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
  };

  setNetworkPolicy = async (policy: HarnessV1NetworkPolicy): Promise<void> => {
    this.networkPolicy = toVercelPolicy(policy);
    await this.updateNetworkPolicy();
  };

  setRequestTransformations = async (
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
  ): Promise<void> => {
    this.requestTransformations = [...transformations];
    await this.updateNetworkPolicy();
  };

  setPorts = async (
    ports: ReadonlyArray<number>,
    options?: { abortSignal?: AbortSignal },
  ): Promise<void> => {
    await this.sandbox.update(
      { ports: [...ports] },
      options?.abortSignal ? { signal: options.abortSignal } : undefined,
    );
  };

  stop = async (): Promise<void> => {
    if (!this.ownsLifecycle) return;
    await this.sandbox.stop();
  };

  destroy = async (): Promise<void> => {
    if (!this.ownsLifecycle) return;
    await this.sandbox.stop().catch(() => {});
    await this.sandbox.delete();
  };

  private updateNetworkPolicy = async (): Promise<void> => {
    await this.sandbox.update({
      networkPolicy: mergeVercelPolicies({
        networkPolicy: this.networkPolicy,
        requestTransformations: this.requestTransformations,
      }),
    });
  };
}

export function toVercelPolicy(policy: HarnessV1NetworkPolicy): NetworkPolicy {
  switch (policy.mode) {
    case 'allow-all':
      return 'allow-all';
    case 'deny-all':
      return 'deny-all';
    case 'custom': {
      const result: Extract<NetworkPolicy, { allow?: unknown }> = {};
      const { allowedHosts, allowedCIDRs, deniedCIDRs } = policy;
      if (allowedHosts != null && allowedHosts.length > 0) {
        result.allow = [...allowedHosts];
      }
      if (
        (allowedCIDRs != null && allowedCIDRs.length > 0) ||
        (deniedCIDRs != null && deniedCIDRs.length > 0)
      ) {
        result.subnets = {
          ...(allowedCIDRs != null && allowedCIDRs.length > 0
            ? { allow: [...allowedCIDRs] }
            : {}),
          ...(deniedCIDRs != null && deniedCIDRs.length > 0
            ? { deny: [...deniedCIDRs] }
            : {}),
        };
      }
      if (result.allow == null && result.subnets == null) {
        throw new HarnessCapabilityUnsupportedError({
          harnessId: VERCEL_PROVIDER_ID,
          message:
            'Custom network policy requires at least one of allowedHosts or allowedCIDRs to be non-empty.',
        });
      }
      return result;
    }
  }
}

export function mergeVercelPolicies({
  networkPolicy,
  requestTransformations,
}: {
  networkPolicy: NetworkPolicy | undefined;
  requestTransformations: ReadonlyArray<HarnessV1RequestTransformation>;
}): NetworkPolicy {
  if (requestTransformations.length === 0) {
    return networkPolicy ?? 'allow-all';
  }

  const allow: Record<string, NetworkPolicyRule[]> = {};
  let subnets: Extract<NetworkPolicy, { subnets?: unknown }>['subnets'];

  if (networkPolicy == null || networkPolicy === 'allow-all') {
    allow['*'] = [];
  } else if (networkPolicy !== 'deny-all') {
    if (Array.isArray(networkPolicy.allow)) {
      for (const host of networkPolicy.allow) {
        allow[host] = [];
      }
    } else if (networkPolicy.allow != null) {
      for (const [host, rules] of Object.entries(networkPolicy.allow)) {
        allow[host] = [...rules];
      }
    }
    subnets = networkPolicy.subnets;
  }

  for (const transformation of requestTransformations) {
    const { host } = transformation.match;
    const rules = allow[host] ?? [];
    rules.push(toVercelRequestTransformationRule(transformation));
    allow[host] = rules;
  }

  return {
    allow,
    ...(subnets == null
      ? {}
      : {
          subnets: {
            ...(subnets.allow == null ? {} : { allow: [...subnets.allow] }),
            ...(subnets.deny == null ? {} : { deny: [...subnets.deny] }),
          },
        }),
  };
}

function toVercelRequestTransformationRule(
  transformation: HarnessV1RequestTransformation,
): NetworkPolicyRule {
  const {
    host: _host,
    method,
    path,
    queryString,
    headers,
  } = transformation.match;
  const match = {
    ...(path == null ? {} : { path: toVercelMatcher(path) }),
    ...(method == null ? {} : { method: [...method] }),
    ...(queryString == null
      ? {}
      : { queryString: queryString.map(toVercelKeyValueMatcher) }),
    ...(headers == null
      ? {}
      : { headers: headers.map(toVercelKeyValueMatcher) }),
  };

  return {
    ...(Object.keys(match).length === 0 ? {} : { match }),
    transform: [{ headers: { ...transformation.transform.headers } }],
  };
}

function toVercelKeyValueMatcher(
  matcher: NonNullable<
    HarnessV1RequestTransformation['match']['headers']
  >[number],
): NetworkPolicyKeyValueMatcher {
  return {
    ...(matcher.key == null ? {} : { key: toVercelMatcher(matcher.key) }),
    ...(matcher.value == null ? {} : { value: toVercelMatcher(matcher.value) }),
  };
}

function toVercelMatcher(
  matcher: NonNullable<HarnessV1RequestTransformation['match']['path']>,
): NetworkPolicyMatcher {
  return { ...matcher };
}
