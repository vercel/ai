import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { randomUUID } from 'node:crypto';
import {
  SPRITES_DEFAULT_BASE_URL,
  SpritesApiClient,
  type SpriteUrlAuth,
} from './sprites-api-client';
import { SpritesNetworkSandboxSession } from './sprites-network-sandbox-session';

const SPRITES_PROVIDER_ID = 'sprites-sandbox';

/**
 * Login directory of the Sprite base image (`sprite` user). Used as the
 * session working directory and the base for resolving relative paths. Override
 * via {@link SpritesConnectionSettings.workingDirectory}.
 */
const DEFAULT_WORKING_DIRECTORY = '/home/sprite';

const SESSION_NAME_PREFIX = 'ai-sdk-harness-session';
const PREWARM_NAME_PREFIX = 'ai-sdk-harness';

/** Connection and shared settings for {@link createSpritesSandbox}. */
export interface SpritesConnectionSettings {
  /**
   * Sprites API token (`org/projectNumber/tokenId/secret`). Defaults to the
   * `SPRITES_API_KEY` or `SPRITES_TOKEN` environment variable.
   */
  apiKey?: string;
  /**
   * Base URL of the Sprites control-plane API. Defaults to the
   * `SPRITES_API_URL` environment variable or `https://api.sprites.dev`.
   */
  baseUrl?: string;
  /**
   * Working directory the session resolves relative paths against and reports
   * as `defaultWorkingDirectory`. Defaults to `/home/sprite`.
   */
  workingDirectory?: string;
}

/**
 * Settings for {@link createSpritesSandbox}. Two mutually-exclusive shapes:
 *
 * - `{ spriteName }` — wrap an already-created Sprite by name. The caller owns
 *   its lifecycle; the provider's `destroy()` is a no-op. Set `urlAuth` to
 *   `'public'` if the harness bridge needs the Sprite's public URL reachable
 *   by a stock WebSocket client.
 * - create-new (no `spriteName`) — the provider creates a fresh Sprite per
 *   session. When a `sessionId` is supplied the Sprite is named
 *   deterministically so `resumeSession({ sessionId })` can reattach. `urlAuth`
 *   defaults to `'public'` so bridge-backed adapters work out of the box.
 */
export type SpritesSandboxSettings =
  | (SpritesConnectionSettings & {
      spriteName: string;
      urlAuth?: SpriteUrlAuth;
    })
  | (SpritesConnectionSettings & {
      spriteName?: never;
      /** Explicit name for the created Sprite (else auto-derived). */
      name?: string;
      /** URL auth mode for the created Sprite. Defaults to `'public'`. */
      urlAuth?: SpriteUrlAuth;
      /** Block on capacity instead of failing fast when the fleet is full. */
      waitForCapacity?: boolean;
    });

export function createSpritesSandbox(
  settings: SpritesSandboxSettings = {} as SpritesSandboxSettings,
): HarnessV1SandboxProvider {
  return new SpritesSandboxProvider(settings);
}

/**
 * `HarnessV1SandboxProvider` implementation backed by [Sprites](https://sprites.dev).
 * Construct one via {@link createSpritesSandbox} at module scope and pass it to
 * a `HarnessAgent` (or call `createSession()` directly for raw access to a
 * network sandbox session).
 */
export class SpritesSandboxProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = SPRITES_PROVIDER_ID;

  private readonly client: SpritesApiClient;
  private readonly workingDirectory: string;

  constructor(private readonly settings: SpritesSandboxSettings) {
    const apiKey =
      settings.apiKey ??
      process.env.SPRITES_API_KEY ??
      process.env.SPRITES_TOKEN;
    if (apiKey == null || apiKey === '') {
      throw new Error(
        'Sprites API key is required. Pass `apiKey` or set the SPRITES_API_KEY environment variable.',
      );
    }
    const baseUrl =
      settings.baseUrl ??
      process.env.SPRITES_API_URL ??
      SPRITES_DEFAULT_BASE_URL;
    this.client = new SpritesApiClient({ apiKey, baseUrl });
    this.workingDirectory =
      settings.workingDirectory ?? DEFAULT_WORKING_DIRECTORY;
  }

  createSession = async (options?: {
    sessionId?: string;
    abortSignal?: AbortSignal;
    identity?: string;
    onFirstCreate?: (
      session: SandboxSession,
      opts: { abortSignal?: AbortSignal },
    ) => Promise<void>;
  }): Promise<HarnessV1NetworkSandboxSession> => {
    options?.abortSignal?.throwIfAborted();

    // Wrap-existing case: caller owns the Sprite.
    if ('spriteName' in this.settings && this.settings.spriteName != null) {
      const sprite = await this.client.getSprite(
        this.settings.spriteName,
        options?.abortSignal,
      );
      if (
        this.settings.urlAuth != null &&
        sprite.urlAuth !== this.settings.urlAuth
      ) {
        await this.client.setUrlAuth(
          sprite.name,
          this.settings.urlAuth,
          options?.abortSignal,
        );
      }
      return new SpritesNetworkSandboxSession({
        client: this.client,
        sprite,
        workingDirectory: this.workingDirectory,
        ownsLifecycle: false,
      });
    }

    const settings = this.settings;
    const name =
      settings.name ??
      (options?.sessionId != null
        ? `${SESSION_NAME_PREFIX}-${sanitizeName(options.sessionId)}`
        : `${PREWARM_NAME_PREFIX}-${randomSuffix()}`);

    const { sprite, created } = await this.client.getOrCreateSprite({
      name,
      ...(settings.waitForCapacity != null
        ? { waitForCapacity: settings.waitForCapacity }
        : {}),
      ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
    });

    const urlAuth = settings.urlAuth ?? 'public';
    if (sprite.urlAuth !== urlAuth) {
      await this.client.setUrlAuth(sprite.name, urlAuth, options?.abortSignal);
    }

    const session = new SpritesNetworkSandboxSession({
      client: this.client,
      sprite: { ...sprite, urlAuth },
      workingDirectory: this.workingDirectory,
      ownsLifecycle: true,
    });

    // Run one-time setup only on a fresh create, matching the
    // "called exactly once per identity" contract.
    if (created && options?.onFirstCreate != null) {
      await options.onFirstCreate(session.restricted(), {
        ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
      });
    }

    return session;
  };

  resumeSession = async (options: {
    sessionId: string;
    abortSignal?: AbortSignal;
  }): Promise<HarnessV1NetworkSandboxSession> => {
    options.abortSignal?.throwIfAborted();

    // Wrap-existing case: caller owns the Sprite. Same session as createSession.
    if ('spriteName' in this.settings && this.settings.spriteName != null) {
      const sprite = await this.client.getSprite(
        this.settings.spriteName,
        options.abortSignal,
      );
      return new SpritesNetworkSandboxSession({
        client: this.client,
        sprite,
        workingDirectory: this.workingDirectory,
        ownsLifecycle: false,
      });
    }

    const name = `${SESSION_NAME_PREFIX}-${sanitizeName(options.sessionId)}`;
    const sprite = await this.client.getSprite(name, options.abortSignal);
    return new SpritesNetworkSandboxSession({
      client: this.client,
      sprite,
      workingDirectory: this.workingDirectory,
      ownsLifecycle: true,
    });
  };
}

/**
 * Turn an arbitrary session id into a DNS-label-safe Sprite name fragment:
 * lowercase alphanumerics and single hyphens, no leading/trailing hyphen.
 */
function sanitizeName(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned.length > 0 ? cleaned : randomSuffix();
}

function randomSuffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}
