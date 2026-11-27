import {
  HarnessSandboxAuthenticationError,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1SandboxSessionCreateOptions,
  type HarnessV1SandboxSessionResumeOptions,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { randomUUID } from 'node:crypto';
import {
  SPRITES_DEFAULT_BASE_URL,
  SpritesApiClient,
  SpritesApiError,
  type SpriteUrlAuth,
} from './sprites-api-client';
import { SpritesNetworkSandboxSession } from './sprites-network-sandbox-session';
import { SpritesSandboxSession } from './sprites-sandbox-session';

const SPRITES_PROVIDER_ID = 'sprites-sandbox';

const PREWARM_NAME_PREFIX = 'ai-sdk-harness';

/**
 * Bridge-backed harness adapters install their in-sandbox bridge with `pnpm`.
 * The stock Sprite image ships `node`, `npm` and `corepack` but no `pnpm` on
 * `PATH`, so a Sprite created here gets it before anything else runs. A
 * Sprite that already has `pnpm` is left as it is.
 */
const PNPM_SETUP_COMMAND =
  'command -v pnpm >/dev/null 2>&1 || ' +
  '{ corepack enable --install-directory /usr/local/bin pnpm && ' +
  'corepack prepare pnpm@11 --activate; }';

/**
 * Connection and shared settings for
 * {@link createSpritesNetworkSandboxSession} and
 * {@link resumeSpritesNetworkSandboxSession}.
 */
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
   * as `defaultWorkingDirectory`. Defaults to the directory the Sprite
   * reports for a new process.
   */
  workingDirectory?: string;
}

/**
 * Flattens an intersection of object types into a single object type so the
 * resolved shape displays as its named properties rather than a chain of
 * `A & B & C`.
 */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * An existing Sprite together with the facts the session API exposes
 * synchronously. The Sprites API reports a Sprite's URL, URL auth and working
 * directory only through asynchronous calls, so the native adaptation receives
 * them alongside the Sprite's name instead of looking them up.
 */
export type SpritesNativeSandboxSession = Pick<
  SpritesConnectionSettings,
  'apiKey' | 'baseUrl'
> & {
  readonly sprite: {
    /** Name of the Sprite. */
    readonly name: string;

    /** Public URL of the Sprite: `https://<name>-<suffix>.sprites.app`. */
    readonly url: string;

    /**
     * URL auth mode the Sprite is on. Only a Sprite on `'public'` exposes its
     * port, so leave it unset for a session that needs no bridge.
     */
    readonly urlAuth?: SpriteUrlAuth;
  };

  /**
   * Absolute working directory of the Sprite: the directory it starts a
   * process in, `/home/sprite` on the stock image.
   */
  readonly workingDirectory: string;
};

type SpritesCreationSettings = SpritesConnectionSettings & {
  /**
   * URL auth mode for the created Sprite. Defaults to `'public'`, which is
   * the only mode a bridge-backed harness adapter can connect to.
   */
  urlAuth?: SpriteUrlAuth;
  /** Block on capacity instead of failing fast when the fleet is full. */
  waitForCapacity?: boolean;
  /** The Sprite is named with `sandboxId`. */
  name?: never;
  spriteName?: never;
};

export type SpritesNetworkSandboxSessionCreateOptions = Prettify<
  HarnessV1SandboxSessionCreateOptions<SpritesCreationSettings> & {
    sandbox?: never;
  }
>;

type SpritesLookupSettings = SpritesConnectionSettings & {
  /**
   * URL auth mode to put the Sprite on. Left as the Sprite has it when unset.
   */
  urlAuth?: SpriteUrlAuth;
  /** The Sprite is looked up by `sandboxId`. */
  name?: never;
  spriteName?: never;
};

export type SpritesNetworkSandboxSessionResumeOptions = Prettify<
  HarnessV1SandboxSessionResumeOptions<SpritesLookupSettings>
>;

/**
 * Create a Sprite and return its network sandbox session. `sandboxId` names
 * the Sprite; a Sprite that already has that name is a conflict, never a
 * lookup. An optional `template` is prepared in the new Sprite before the
 * session is returned. The caller owns the Sprite: `destroy()` deletes it.
 */
export async function createSpritesNetworkSandboxSession(
  options: SpritesNetworkSandboxSessionCreateOptions = {},
): Promise<HarnessV1NetworkSandboxSession> {
  if ('sandbox' in options) {
    throw new Error(
      'createSpritesNetworkSandboxSession: use createSpritesNetworkSandboxSessionFromNativeSandbox for an existing Sprite.',
    );
  }
  if ('spriteName' in options) {
    throw new Error(
      'createSpritesNetworkSandboxSession: use resumeSpritesNetworkSandboxSession({ sandboxId }) for an existing Sprite.',
    );
  }
  const { template, abortSignal, sandboxId, waitForCapacity } = options;
  abortSignal?.throwIfAborted();
  const client = createSpritesApiClient(options);
  const name = sandboxId ?? `${PREWARM_NAME_PREFIX}-${randomSuffix()}`;

  const { sprite, created } = await withSpritesSandboxAuthenticationError(() =>
    client.getOrCreateSprite({
      name,
      ...(waitForCapacity != null ? { waitForCapacity } : {}),
      ...(abortSignal ? { abortSignal } : {}),
    }),
  );
  if (!created) {
    throw new Error(
      `createSpritesNetworkSandboxSession: a Sprite named "${name}" already exists. Use resumeSpritesNetworkSandboxSession({ sandboxId }) to reattach to it.`,
    );
  }

  try {
    const urlAuth = options.urlAuth ?? 'public';
    if (sprite.urlAuth !== urlAuth) {
      await withSpritesSandboxAuthenticationError(() =>
        client.setUrlAuth(sprite.name, urlAuth, abortSignal),
      );
    }
    const session = new SpritesNetworkSandboxSession({
      client,
      sprite: { ...sprite, urlAuth },
      workingDirectory:
        options.workingDirectory ??
        (await resolveSpriteWorkingDirectory({
          client,
          spriteName: sprite.name,
          abortSignal,
        })),
    });
    await ensurePnpm({ session, abortSignal });
    // Sprites have no snapshot to start further Sprites from, so the template
    // is prepared in every new Sprite.
    await template?.prepare({
      session: session.restricted(),
      ...(abortSignal ? { abortSignal } : {}),
    });
    return session;
  } catch (error) {
    await client.deleteSprite(sprite.name).catch(() => {});
    throw error;
  }
}

/**
 * Reattach to the existing Sprite named `sandboxId` and return its network
 * sandbox session. Never creates a Sprite. The caller owns the Sprite:
 * `destroy()` deletes it.
 */
export async function resumeSpritesNetworkSandboxSession(
  options: SpritesNetworkSandboxSessionResumeOptions,
): Promise<HarnessV1NetworkSandboxSession> {
  const { sandboxId, abortSignal, urlAuth } = options;
  abortSignal?.throwIfAborted();
  const client = createSpritesApiClient(options);

  const sprite = await withSpritesSandboxAuthenticationError(() =>
    client.getSprite(sandboxId, abortSignal),
  );
  if (urlAuth != null && sprite.urlAuth !== urlAuth) {
    await withSpritesSandboxAuthenticationError(() =>
      client.setUrlAuth(sprite.name, urlAuth, abortSignal),
    );
  }
  return new SpritesNetworkSandboxSession({
    client,
    sprite: urlAuth != null ? { ...sprite, urlAuth } : sprite,
    workingDirectory:
      options.workingDirectory ??
      (await resolveSpriteWorkingDirectory({
        client,
        spriteName: sprite.name,
        abortSignal,
      })),
  });
}

/**
 * Adapt an existing Sprite to the file and process surface, without a request
 * to the Sprites API.
 */
export function createSpritesSandboxSessionFromNativeSandbox(
  nativeSandbox: SpritesNativeSandboxSession,
): SandboxSession {
  return new SpritesSandboxSession(
    createSpritesApiClient(nativeSandbox),
    nativeSandbox.sprite.name,
    nativeSandbox.sprite.url,
    nativeSandbox.workingDirectory,
  );
}

/**
 * Adapt an existing Sprite to a network sandbox session, without a request to
 * the Sprites API. The caller owns the Sprite: `destroy()` deletes it.
 */
export function createSpritesNetworkSandboxSessionFromNativeSandbox(
  nativeSandbox: SpritesNativeSandboxSession,
): HarnessV1NetworkSandboxSession {
  return new SpritesNetworkSandboxSession({
    client: createSpritesApiClient(nativeSandbox),
    sprite: nativeSandbox.sprite,
    workingDirectory: nativeSandbox.workingDirectory,
  });
}

function createSpritesApiClient(
  settings: Pick<SpritesConnectionSettings, 'apiKey' | 'baseUrl'>,
): SpritesApiClient {
  const apiKey =
    settings.apiKey ?? process.env.SPRITES_API_KEY ?? process.env.SPRITES_TOKEN;
  if (apiKey == null || apiKey === '') {
    throw new HarnessSandboxAuthenticationError({
      message:
        'Sprites API key is required. Pass `apiKey` or set the SPRITES_API_KEY environment variable.',
      sandboxProviderId: SPRITES_PROVIDER_ID,
    });
  }
  const baseUrl =
    settings.baseUrl ?? process.env.SPRITES_API_URL ?? SPRITES_DEFAULT_BASE_URL;
  return new SpritesApiClient({ apiKey, baseUrl });
}

const SPRITES_SANDBOX_AUTHENTICATION_MESSAGE =
  'Sprites authentication failed. Pass `apiKey` or set the SPRITES_API_KEY environment variable, then verify that the token can access the Sprites API.';

/**
 * Rethrow rejected credentials (401, 403) from acquiring a Sprite as the
 * error the harness uses to tell configuration failures apart.
 */
async function withSpritesSandboxAuthenticationError<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      !(error instanceof SpritesApiError) ||
      (error.status !== 401 && error.status !== 403)
    ) {
      throw error;
    }
    throw new HarnessSandboxAuthenticationError({
      message: SPRITES_SANDBOX_AUTHENTICATION_MESSAGE,
      sandboxProviderId: SPRITES_PROVIDER_ID,
      cause: error,
    });
  }
}

async function ensurePnpm({
  session,
  abortSignal,
}: {
  session: SandboxSession;
  abortSignal: AbortSignal | undefined;
}): Promise<void> {
  const { exitCode, stdout, stderr } = await session.run({
    command: PNPM_SETUP_COMMAND,
    ...(abortSignal ? { abortSignal } : {}),
  });
  if (exitCode !== 0) {
    throw new Error(
      `Failed to install pnpm in the Sprite (exit ${exitCode}): ${stderr || stdout}`,
    );
  }
}

/**
 * The directory a process starts in when no working directory is given, read
 * from the Sprite itself rather than assumed.
 */
async function resolveSpriteWorkingDirectory({
  client,
  spriteName,
  abortSignal,
}: {
  client: SpritesApiClient;
  spriteName: string;
  abortSignal: AbortSignal | undefined;
}): Promise<string> {
  const proc = await client.exec(spriteName, {
    argv: ['pwd'],
    ...(abortSignal ? { abortSignal } : {}),
  });
  const [stdout, stderr, { exitCode }] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.wait(),
  ]);
  const workingDirectory = stdout.trim();
  if (exitCode !== 0 || !workingDirectory.startsWith('/')) {
    throw new Error(
      `Failed to resolve the working directory of Sprite "${spriteName}" (exit ${exitCode}): ${stderr || stdout}`,
    );
  }
  return workingDirectory === '/'
    ? workingDirectory
    : workingDirectory.replace(/\/+$/, '');
}

function randomSuffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}
