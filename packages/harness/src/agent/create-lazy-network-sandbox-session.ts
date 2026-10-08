import type { HarnessV1NetworkSandboxSession } from '../v1';
import { delegateSandboxOperations } from './internal/sandbox-operations';

/**
 * Creates a network sandbox session that acquires its sandbox on first use.
 *
 * Pair it with `sandboxConfig.setup: 'lazy'` on `HarnessAgent` so that a
 * session whose turns never touch the sandbox neither creates nor resumes
 * one. The harness adapter must not declare a sandbox bootstrap recipe.
 *
 * The returned session does not provide `setNetworkPolicy`,
 * `setRequestTransformations`, `addRequestTransformations`, or `setPorts`.
 * Adapters that need them need an eagerly created session.
 */
export function createLazyNetworkSandboxSession(options: {
  /**
   * Acquires the sandbox: create one, or resume one by id. Called at most
   * once, on the first file, exec, spawn, or port operation. A rejected
   * acquisition stays rejected for every later operation, because the sandbox
   * may or may not exist and must not be created twice. Record the sandbox id
   * here: `id` throws until the acquisition resolves.
   */
  readonly acquire: () => PromiseLike<HarnessV1NetworkSandboxSession>;

  /**
   * The default working directory the acquired sandbox will report.
   * `HarnessAgent` derives the session work directory from it in
   * `createSession()`, before the sandbox exists.
   */
  readonly defaultWorkingDirectory: string;

  /**
   * Description handed to the harness adapter; fixed for the session.
   * Defaults to a sentence saying the sandbox starts on first use.
   */
  readonly description?: string;

  /**
   * Ports the acquired sandbox exposes. Defaults to none.
   */
  readonly ports?: ReadonlyArray<number>;
}): HarnessV1NetworkSandboxSession {
  const description =
    options.description ??
    'A sandbox session whose sandbox starts on its first file, exec, or spawn operation.';
  let acquisition: Promise<HarnessV1NetworkSandboxSession> | undefined;
  let acquiredSession: HarnessV1NetworkSandboxSession | undefined;
  const acquired = () =>
    (acquisition ??= (async () => {
      const session = await options.acquire();
      acquiredSession = session;
      return session;
    })());
  const settledSession = async () =>
    acquisition == null ? undefined : acquisition.catch(() => undefined);

  return {
    ...delegateSandboxOperations(acquired),
    description,
    get id() {
      if (acquiredSession == null) {
        throw new Error('Lazy sandbox session has not been acquired yet.');
      }
      return acquiredSession.id;
    },
    defaultWorkingDirectory: options.defaultWorkingDirectory,
    ports: options.ports ?? [],
    getPortEndpoint: async portOptions =>
      (await acquired()).getPortEndpoint(portOptions),
    getPortUrl: async portOptions => (await acquired()).getPortUrl(portOptions),
    stop: async () => {
      await (await settledSession())?.stop();
    },
    destroy: async () => {
      await (await settledSession())?.destroy();
    },
    restricted: () => ({
      description,
      ...delegateSandboxOperations(async () => (await acquired()).restricted()),
    }),
  };
}
