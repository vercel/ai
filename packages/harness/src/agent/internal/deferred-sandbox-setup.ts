import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessV1NetworkSandboxSession } from '../../v1';
import { delegateSandboxOperations } from './sandbox-operations';

export function deferSandboxSetup({
  sandboxSession,
  setup,
}: {
  readonly sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  readonly setup: () => Promise<void>;
}): HarnessV1NetworkSandboxSession | SandboxSession {
  let pending: Promise<void> | undefined;
  const ensureSetup = () =>
    (pending ??= setup().catch(error => {
      pending = undefined;
      throw error;
    }));
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
    restricted: () => gate(original.restricted()),
  };
}
