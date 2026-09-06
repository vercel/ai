import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import type {
  HarnessAgentContinueTurnState,
  HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import { classifyDiskLog } from '@ai-sdk/harness/utils';
import {
  parseJSON,
  type Experimental_SandboxSession,
} from '@ai-sdk/provider-utils';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

type HandoffPhase = 'start' | 'resume';

type HandoffState<TState> = {
  sessionId: string;
  state: TState;
};

export function getACPHandoffArguments({
  exampleName,
  defaultStatePath,
}: {
  exampleName: string;
  defaultStatePath: string;
}): {
  phase: HandoffPhase;
  statePath: string;
} {
  const configuredPhase =
    process.env.AI_SDK_ACP_HANDOFF_PHASE ?? process.argv[2];
  const statePath =
    process.env.AI_SDK_ACP_HANDOFF_STATE_PATH ??
    process.argv[3] ??
    defaultStatePath;
  if (
    configuredPhase != null &&
    configuredPhase !== 'start' &&
    configuredPhase !== 'resume'
  ) {
    throw new Error(
      `AI_SDK_ACP_HANDOFF_PHASE must be "start" or "resume" when running aif ${exampleName}.`,
    );
  }
  const phase = configuredPhase ?? (existsSync(statePath) ? 'resume' : 'start');
  return { phase, statePath };
}

export function createACPHandoffSandbox() {
  return createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
}

export async function writeACPHandoffState({
  statePath,
  sessionId,
  state,
}: {
  statePath: string;
  sessionId: string;
  state: HarnessAgentResumeSessionState | HarnessAgentContinueTurnState;
}): Promise<void> {
  await writeFile(
    statePath,
    `${JSON.stringify({ sessionId, state }, null, 2)}\n`,
    {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    },
  );
}

export async function readACPResumeHandoffState({
  statePath,
}: {
  statePath: string;
}): Promise<HandoffState<HarnessAgentResumeSessionState>> {
  const handoff = await readACPHandoffState({ statePath });
  if (handoff.state.type !== 'resume-session') {
    throw new Error(
      `Expected resume-session state in ${statePath}, received ${handoff.state.type}.`,
    );
  }
  return {
    sessionId: handoff.sessionId,
    state: handoff.state,
  };
}

export async function readACPContinueHandoffState({
  statePath,
}: {
  statePath: string;
}): Promise<HandoffState<HarnessAgentContinueTurnState>> {
  const handoff = await readACPHandoffState({ statePath });
  if (handoff.state.type !== 'continue-turn') {
    throw new Error(
      `Expected continue-turn state in ${statePath}, received ${handoff.state.type}.`,
    );
  }
  return {
    sessionId: handoff.sessionId,
    state: handoff.state,
  };
}

export async function removeACPHandoffState({
  statePath,
}: {
  statePath: string;
}): Promise<void> {
  await unlink(statePath);
}

export async function waitForACPCompletedRecoveryLog({
  sandboxSession,
  state,
  timeoutMs = 60_000,
}: {
  sandboxSession: Experimental_SandboxSession;
  state: HarnessAgentContinueTurnState;
  timeoutMs?: number;
}): Promise<void> {
  const { stateDir } = getACPBridgeRecoveryCoordinates({ state });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const eventLog = await sandboxSession.readTextFile({
      path: `${stateDir}/event-log.ndjson`,
    });
    const recoveryMode = await classifyDiskLog(eventLog);
    if (recoveryMode === 'replay') return;
    if (Date.now() >= deadline) {
      throw new Error(
        'ACP bridge did not persist a completed replayable event log before timeout.',
      );
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

export async function terminateACPBridgeForRecovery({
  sandboxSession,
  state,
}: {
  sandboxSession: Experimental_SandboxSession;
  state: HarnessAgentContinueTurnState;
}): Promise<void> {
  const { stateDir } = getACPBridgeRecoveryCoordinates({ state });
  const rawMeta = await sandboxSession.readTextFile({
    path: `${stateDir}/bridge-meta.json`,
  });
  if (rawMeta == null) {
    throw new Error(`ACP bridge metadata is missing from ${stateDir}.`);
  }
  const meta = await parseJSON({ text: rawMeta });
  if (
    meta == null ||
    typeof meta !== 'object' ||
    Array.isArray(meta) ||
    typeof meta.pid !== 'number' ||
    !Number.isSafeInteger(meta.pid) ||
    meta.pid <= 1
  ) {
    throw new Error(`ACP bridge metadata in ${stateDir} has no valid PID.`);
  }
  const terminated = await sandboxSession.run({
    command: `pkill -TERM -P ${meta.pid}; kill -TERM ${meta.pid}`,
  });
  if (terminated.exitCode !== 0) {
    throw new Error(
      `Failed to terminate ACP bridge ${meta.pid}: ${terminated.stderr}`,
    );
  }
}

export async function assertACPRecoveryArtifactsExcludeSecrets({
  sandboxSession,
  state,
  secrets,
}: {
  sandboxSession: Experimental_SandboxSession;
  state: HarnessAgentContinueTurnState;
  secrets: ReadonlyArray<string | undefined>;
}): Promise<void> {
  const { stateDir } = getACPBridgeRecoveryCoordinates({ state });
  const contents = [JSON.stringify(state)];
  for (const name of [
    'start-config.json',
    'rerun-start-config.json',
    'pending-host-input.json',
    'event-log.ndjson',
  ]) {
    contents.push(
      (await sandboxSession.readTextFile({ path: `${stateDir}/${name}` })) ??
        '',
    );
  }
  const serialized = contents.join('\n');
  for (const secret of secrets) {
    if (secret != null && secret.length > 0 && serialized.includes(secret)) {
      throw new Error(
        `ACP recovery artifact ${stateDir} contains a resolved credential.`,
      );
    }
  }
}

function getACPBridgeRecoveryCoordinates({
  state,
}: {
  state: HarnessAgentContinueTurnState;
}): {
  stateDir: string;
  lastSeenEventId: number;
} {
  const data = state.data;
  const bridge =
    data != null && typeof data === 'object' && !Array.isArray(data)
      ? data.bridge
      : undefined;
  if (
    bridge == null ||
    typeof bridge !== 'object' ||
    Array.isArray(bridge) ||
    typeof bridge.stateDir !== 'string' ||
    !bridge.stateDir.startsWith('/') ||
    typeof bridge.lastSeenEventId !== 'number'
  ) {
    throw new Error('ACP continuation state has no bridge recovery location.');
  }
  return {
    stateDir: bridge.stateDir,
    lastSeenEventId: bridge.lastSeenEventId,
  };
}

async function readACPHandoffState({
  statePath,
}: {
  statePath: string;
}): Promise<
  HandoffState<HarnessAgentResumeSessionState | HarnessAgentContinueTurnState>
> {
  const value = await parseJSON({
    text: await readFile(statePath, 'utf8'),
  });
  if (
    value == null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.sessionId !== 'string' ||
    value.state == null ||
    typeof value.state !== 'object' ||
    Array.isArray(value.state) ||
    (value.state.type !== 'resume-session' &&
      value.state.type !== 'continue-turn')
  ) {
    throw new Error(`Invalid ACP handoff state in ${statePath}.`);
  }
  return value as unknown as HandoffState<
    HarnessAgentResumeSessionState | HarnessAgentContinueTurnState
  >;
}
