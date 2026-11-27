import type { World } from '@workflow/world';
import type { HarnessAgent } from './harness-agent';

/**
 * A durable HarnessAgent registry entry provides the operations needed by a
 * background drive. `createSession` and `drive` are bound to their agent.
 */
type DurableHarnessAgentRegistryEntry = {
  /**
   * The stable identifier recorded on this HarnessAgent's workflow runs.
   */
  readonly id: string;

  /**
   * The World that stores this HarnessAgent's workflow runs.
   */
  readonly world: World;

  /**
   * Creates a session for a workflow run.
   */
  readonly createSession: HarnessAgent['createSession'];

  /**
   * Drives a session using a queue job.
   */
  readonly drive: HarnessAgent['drive'];
};

/**
 * Process-wide state of the durable agent registry, kept on `globalThis`
 * under a registered symbol, since bundlers may load several copies of this
 * module into one process (e.g. one per Next.js route), and they must all
 * share one registry.
 */
type DurableHarnessAgentRegistryState = {
  /**
   * Registered agents by `id`.
   */
  agents: Map<string, DurableHarnessAgentRegistryEntry>;

  /**
   * IDs registered in the current microtask tick, if any were.
   */
  registeredThisTick?: Set<string>;
};

const STATE_KEY = Symbol.for('@ai-sdk/harness//durable-agent-registry');

/**
 * Returns the shared process-wide durable HarnessAgent registry state.
 */
function getState(): DurableHarnessAgentRegistryState {
  const holder = globalThis as {
    [STATE_KEY]?: DurableHarnessAgentRegistryState;
  };
  holder[STATE_KEY] ??= { agents: new Map() };
  return holder[STATE_KEY];
}

/**
 * Adds a durable HarnessAgent to the registry.
 *
 * The latest agent registered under an `id` replaces an earlier one: a
 * module evaluated again, by a hot reload or in another module graph of the
 * same process, makes its agent again. Two agents registered under one `id`
 * in the same microtask tick (e.g. two agents with the same `id` in one
 * module) throw instead: their sessions' workflow runs could not tell them
 * apart.
 */
export function registerDurableHarnessAgent(
  entry: DurableHarnessAgentRegistryEntry,
): void {
  const state = getState();
  let registeredThisTick = state.registeredThisTick;
  if (registeredThisTick == null) {
    registeredThisTick = new Set();
    state.registeredThisTick = registeredThisTick;
    queueMicrotask(() => {
      state.registeredThisTick = undefined;
    });
  }
  if (registeredThisTick.has(entry.id)) {
    throw new Error(
      `HarnessAgent: two durable HarnessAgents have the \`id\` \`${entry.id}\`. A session's workflow run records its agent's \`id\`, so every durable HarnessAgent needs an \`id\` of its own.`,
    );
  }
  registeredThisTick.add(entry.id);
  state.agents.set(entry.id, entry);
}

/**
 * The durable HarnessAgent registered under `id`, if any.
 */
export function getDurableHarnessAgent(options: {
  id: string;
}): DurableHarnessAgentRegistryEntry | undefined {
  return getState().agents.get(options.id);
}

/**
 * Every durable HarnessAgent in the registry.
 */
export function getDurableHarnessAgents(): DurableHarnessAgentRegistryEntry[] {
  return [...getState().agents.values()];
}
