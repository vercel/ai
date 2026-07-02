import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { createHash, randomUUID } from 'node:crypto';
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
const TEMPLATE_NAME_PREFIX = 'ai-sdk-harness-tmpl';
const PREWARM_NAME_PREFIX = 'ai-sdk-harness';

/** Written into a Sprite once `onFirstCreate` succeeds, keyed by identity. */
const BOOTSTRAP_MARKER = new TextEncoder().encode('done');

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
 *   its lifecycle; the provider's `destroy()` is a no-op. `urlAuth` is left
 *   alone unless set: a wrapped Sprite left on `'sprite'` auth is unreachable
 *   to a stock WebSocket bridge client, which is redirected (302) at the auth
 *   gate instead of reaching the in-Sprite bridge. Set `urlAuth` to `'public'`
 *   if the harness bridge needs the Sprite's public URL reachable that way.
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
    const identity = options?.identity;
    // Name resolution: a sessionId yields a resumable per-session Sprite; an
    // identity (e.g. prewarm) yields a reusable template Sprite so repeat calls
    // hit the same resource instead of leaking a fresh random one each time;
    // otherwise fall back to a random name.
    const name =
      settings.name ??
      (options?.sessionId != null
        ? `${SESSION_NAME_PREFIX}-${sanitizeName(options.sessionId)}`
        : identity != null
          ? `${TEMPLATE_NAME_PREFIX}-${sanitizeName(identity)}`
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

    // Run one-time setup once per identity. Gate on a persisted completion
    // marker (not the create-vs-409 result) so a setup that fails *after* the
    // Sprite is created re-runs next time instead of leaving it permanently
    // un-bootstrapped.
    if (options?.onFirstCreate != null) {
      const marker = identity != null ? this.markerPath(identity) : undefined;
      const alreadyDone =
        marker != null
          ? !created &&
            (await this.client.readFile(
              sprite.name,
              marker,
              options?.abortSignal,
            )) != null
          : !created;
      if (!alreadyDone) {
        await options.onFirstCreate(session.restricted(), {
          ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
        });
        if (marker != null) {
          await this.client.writeFile(
            sprite.name,
            marker,
            BOOTSTRAP_MARKER,
            options?.abortSignal,
          );
        }
      }
    }

    return session;
  };

  private markerPath(identity: string): string {
    return `${this.workingDirectory}/.ai-sdk-harness/bootstrap-${sanitizeName(identity)}.done`;
  }

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
      if (
        this.settings.urlAuth != null &&
        sprite.urlAuth !== this.settings.urlAuth
      ) {
        await this.client.setUrlAuth(
          sprite.name,
          this.settings.urlAuth,
          options.abortSignal,
        );
      }
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

/** Max chars of the readable slug portion of a derived name (see {@link sanitizeName}). */
const NAME_SLUG_MAX_LENGTH = 28;
/**
 * Hex chars of the SHA-256 suffix (see {@link sanitizeName}). 10 hex = 40 bits:
 * the birthday bound puts a 50% collision at ~2^20 (~1M) distinct inputs, which
 * dwarfs any realistic live session/identity population, while keeping the
 * derived fragment inside the platform's DNS-label budget.
 */
const NAME_HASH_LENGTH = 10;

/**
 * Turn an arbitrary session id or identity into a DNS-label-safe, *collision-
 * resistant* Sprite name fragment. This is security-critical: names are the
 * durable lookup key `resumeSession` re-derives, so two distinct inputs that
 * mapped to the same name would let a resumed session attach to another
 * session's Sprite and read its data.
 *
 * Layout: `<slug>-<hash>`, or just `<hash>` when the slug is empty, where
 *  - `slug` is the lowercased input with runs of non-alphanumerics collapsed to
 *    single hyphens (leading/trailing stripped) and truncated to
 *    {@link NAME_SLUG_MAX_LENGTH} — a lossy, human-readable hint only, never
 *    relied on for uniqueness;
 *  - `hash` is the first {@link NAME_HASH_LENGTH} hex chars of SHA-256 over the
 *    *original* (un-sanitized) value, so two inputs whose slugs collide still
 *    differ here.
 *
 * The result is fully deterministic — no randomness, no stored state — so
 * `resumeSession({ sessionId })` and the bootstrap marker path re-derive the
 * identical name. Length: the longest prefix (`ai-sdk-harness-session-`, 23) +
 * 28 slug + `-` + 10 hash = 62, within the 63-char DNS-label limit of the
 * `<name>-<suffix>.sprites.app` public URL.
 */
function sanitizeName(value: string): string {
  const hash = createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, NAME_HASH_LENGTH);
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NAME_SLUG_MAX_LENGTH)
    // A slice can land mid-hyphen-run, re-introducing a trailing hyphen.
    .replace(/-+$/g, '');
  return slug.length > 0 ? `${slug}-${hash}` : hash;
}

function randomSuffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}
