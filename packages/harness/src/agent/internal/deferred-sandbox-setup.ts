import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessV1NetworkSandboxSession } from '../../v1';
import { getRestrictedSandboxSession } from '../../utils/get-restricted-sandbox-session';
import { delegateSandboxOperations } from './sandbox-operations';

function retryOnFailure<T>(run: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () =>
    (pending ??= run().catch(error => {
      pending = undefined;
      throw error;
    }));
}

export function deferSandboxSetup({
  sandboxSession,
  setup,
}: {
  readonly sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  readonly setup: () => Promise<void>;
}): HarnessV1NetworkSandboxSession | SandboxSession {
  const ensureSetup = retryOnFailure(setup);
  const gatedOperations = (target: SandboxSession) =>
    delegateSandboxOperations(async () => {
      await ensureSetup();
      return target;
    });
  const gate = (target: SandboxSession): SandboxSession => ({
    get description() {
      return target.description;
    },
    ...gatedOperations(target),
  });

  if (!('restricted' in sandboxSession)) {
    return gate(sandboxSession);
  }

  const original = sandboxSession;
  const setNetworkPolicy = original.setNetworkPolicy?.bind(original);
  const setRequestTransformations =
    original.setRequestTransformations?.bind(original);
  const addRequestTransformations =
    original.addRequestTransformations?.bind(original);
  const setPorts = original.setPorts?.bind(original);
  let restricted: SandboxSession | undefined;
  return {
    ...gatedOperations(original),
    get description() {
      return original.description;
    },
    get id() {
      return original.id;
    },
    get defaultWorkingDirectory() {
      return original.defaultWorkingDirectory;
    },
    get ports() {
      return original.ports;
    },
    getPortEndpoint: options => original.getPortEndpoint(options),
    getPortUrl: options => original.getPortUrl(options),
    stop: () => original.stop(),
    destroy: () => original.destroy(),
    ...(setNetworkPolicy != null ? { setNetworkPolicy } : {}),
    ...(setRequestTransformations != null ? { setRequestTransformations } : {}),
    ...(addRequestTransformations != null ? { addRequestTransformations } : {}),
    ...(setPorts != null ? { setPorts } : {}),
    restricted: () => (restricted ??= gate(original.restricted())),
  };
}

export function deferSandboxSession({
  defaultWorkingDirectory,
  createSandboxSession,
  setup,
}: {
  readonly defaultWorkingDirectory: string;
  readonly createSandboxSession: (options: {
    abortSignal?: AbortSignal;
  }) => PromiseLike<HarnessV1NetworkSandboxSession | SandboxSession>;
  readonly setup: (
    sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession,
  ) => Promise<void>;
}): SandboxSession {
  let createdSandboxSession:
    | HarnessV1NetworkSandboxSession
    | SandboxSession
    | undefined;
  const ensureSandboxSession = retryOnFailure(async () => {
    createdSandboxSession ??= await createSandboxSession({});
    await setup(createdSandboxSession);
    return getRestrictedSandboxSession(createdSandboxSession);
  });
  return {
    get description() {
      return (
        createdSandboxSession?.description ??
        `Sandbox with the working directory ${defaultWorkingDirectory}. It starts on first use.`
      );
    },
    ...delegateSandboxOperations(ensureSandboxSession),
  };
}
