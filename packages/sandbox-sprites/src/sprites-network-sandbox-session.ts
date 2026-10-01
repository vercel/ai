import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkPolicy,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PortEndpoint,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import {
  SPRITE_HTTP_PORT,
  type SpriteNetworkRule,
  type SpriteResource,
  type SpriteUrlAuth,
  type SpritesApiClient,
} from './sprites-api-client';
import { SpritesSandboxSession } from './sprites-sandbox-session';

const SPRITES_PROVIDER_ID = 'sprites-sandbox';

/**
 * `HarnessV1NetworkSandboxSession` backed by a Sprite. It extends
 * {@link SpritesSandboxSession} with the infra surface (port resolution,
 * lifecycle, network policy).
 *
 * Sprites proxy a single internal HTTP port ({@link SPRITE_HTTP_PORT}) to the
 * always-on public URL, so `ports` is exactly `[8080]` and `getPortEndpoint`
 * resolves that one port to the public URL. Bridge-backed harness adapters
 * dial `getPortEndpoint({ port: 8080, protocol: 'ws' })` and append
 * `?agent_bridge_token=…`; the Sprite must have `url` auth set to `public` for
 * a stock WebSocket client (no auth header) to reach the in-Sprite bridge.
 *
 * A Sprite on any other URL auth turns that client away at the auth gate, so
 * its session exposes no port: `ports` is empty and `getPortEndpoint` throws.
 * Such a session supports file and process access only and is not selected by
 * bridge-backed adapters.
 *
 * `destroy()` deletes the Sprite when the session owns its lifecycle, which is
 * every session except one the deprecated provider wraps around a
 * caller-named Sprite (`spriteName`); there `destroy()` is a no-op.
 */
export class SpritesNetworkSandboxSession
  extends SpritesSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly id: string;
  readonly defaultWorkingDirectory: string;
  private readonly ownsLifecycle: boolean;
  private readonly urlAuth: SpriteUrlAuth | undefined;

  constructor(input: {
    client: SpritesApiClient;
    sprite: SpriteResource;
    workingDirectory: string;
    ownsLifecycle: boolean;
  }) {
    super(
      input.client,
      input.sprite.name,
      input.sprite.url,
      input.workingDirectory,
    );
    // The Sprite name is the durable lookup key the harness persists for
    // cross-process resume (provider.resumeSession({ sessionId }) derives the
    // same name).
    this.id = input.sprite.name;
    this.defaultWorkingDirectory = input.workingDirectory;
    this.ownsLifecycle = input.ownsLifecycle;
    this.urlAuth = input.sprite.urlAuth;
  }

  get ports(): ReadonlyArray<number> {
    return this.urlAuth === 'public' ? [SPRITE_HTTP_PORT] : [];
  }

  restricted(): SandboxSession {
    return new SpritesSandboxSession(
      this.client,
      this.spriteName,
      this.spritePublicUrl,
      this.workingDirectory,
    );
  }

  getPortEndpoint = async (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<HarnessV1PortEndpoint> => {
    if (options.port !== SPRITE_HTTP_PORT) {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: SPRITES_PROVIDER_ID,
        message:
          `Sprites proxy only the single HTTP port ${SPRITE_HTTP_PORT} to the public URL. ` +
          `Requested port ${options.port} is not reachable.`,
      });
    }
    if (this.urlAuth !== 'public') {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: SPRITES_PROVIDER_ID,
        message:
          `Sprite "${this.spriteName}" is not on public URL auth, so port ${SPRITE_HTTP_PORT} cannot be reached without Sprites credentials. ` +
          "Set `urlAuth: 'public'` to expose it.",
      });
    }
    const url = new URL(this.spritePublicUrl);
    const isSecure = url.protocol === 'https:';
    switch (options.protocol ?? 'https') {
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
    // A public Sprite URL needs no headers: the bridge token in the query
    // string is the only credential a stock WebSocket client presents.
    return { url: url.toString() };
  };

  /**
   * @deprecated Use `getPortEndpoint` instead.
   */
  getPortUrl = async (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<string> => {
    return (await this.getPortEndpoint(options)).url;
  };

  setNetworkPolicy = async (policy: HarnessV1NetworkPolicy): Promise<void> => {
    await this.client.setNetworkPolicy(this.spriteName, toSpriteRules(policy));
  };

  stop = async (): Promise<void> => {
    // Sprites have no explicit stop primitive — they only auto-suspend (go
    // "cold") after ~30s idle. The contract's "stop" therefore maps to that
    // auto-suspend behavior rather than an action this method takes: it
    // returns without doing anything, and the Sprite will suspend on its own
    // once idle. Resource teardown for provider-owned sprites happens in
    // destroy().
  };

  destroy = async (): Promise<void> => {
    if (!this.ownsLifecycle) return;
    await this.client.deleteSprite(this.spriteName);
  };
}

/**
 * Translate the harness-level {@link HarnessV1NetworkPolicy} to Sprites'
 * domain-based outbound rule list. Sprites enforce egress by domain pattern
 * (e.g. `*.npmjs.org`), not by CIDR, so CIDR-based custom policies are
 * rejected as unsupported.
 */
export function toSpriteRules(
  policy: HarnessV1NetworkPolicy,
): SpriteNetworkRule[] {
  switch (policy.mode) {
    case 'allow-all':
      // Empty rule set is the Sprite default: outbound allowed.
      return [];
    case 'deny-all':
      return [{ action: 'deny', domain: '*' }];
    case 'custom': {
      if (
        (policy.allowedCIDRs?.length ?? 0) > 0 ||
        (policy.deniedCIDRs?.length ?? 0) > 0
      ) {
        throw new HarnessCapabilityUnsupportedError({
          harnessId: SPRITES_PROVIDER_ID,
          message:
            'Sprites network policy is domain-based and does not support CIDR ' +
            'allow/deny rules. Use allowedHosts with domain patterns instead.',
        });
      }
      const hosts = policy.allowedHosts ?? [];
      if (hosts.length === 0) {
        throw new HarnessCapabilityUnsupportedError({
          harnessId: SPRITES_PROVIDER_ID,
          message:
            'Custom Sprites network policy requires at least one allowedHosts ' +
            'domain pattern.',
        });
      }
      const rules: SpriteNetworkRule[] = hosts.map(domain => ({
        action: 'allow',
        domain,
      }));
      rules.push({ action: 'deny', domain: '*' });
      return rules;
    }
  }
}
