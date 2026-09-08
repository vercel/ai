import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { isHarnessAuthenticationEnvironment } from '@ai-sdk/harness/utils';
import { resolvePiEnv, type PiAuthenticationMode } from './pi-auth';

export function resolvePiSubscriptionAgentDir({
  options,
  env,
  agentDir,
  homeDirectory = homedir(),
}: {
  options: PiAuthenticationMode | undefined;
  env: NodeJS.ProcessEnv;
  agentDir?: string;
  homeDirectory?: string;
}): string | undefined {
  if (isHarnessAuthenticationEnvironment(options) || options === 'ai-gateway') {
    return undefined;
  }
  const resolvedEnvironment = resolvePiEnv({ options, env });
  if (
    Object.entries(resolvedEnvironment).some(
      ([name, value]) =>
        value != null &&
        (name.endsWith('_API_KEY') || name === 'ANTHROPIC_AUTH_TOKEN'),
    )
  ) {
    return undefined;
  }
  return resolve(
    agentDir ?? env.PI_CODING_AGENT_DIR ?? `${homeDirectory}/.pi/agent`,
  );
}
