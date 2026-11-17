import type { World } from '@workflow/world';
import {
  getDurableHarnessAgent,
  getDurableHarnessAgents,
} from '../durable-agent-registry';
import {
  getDurableHarnessAgentWorkflowName,
  HARNESS_AGENT_WORKFLOW_NAME_PREFIX,
} from './workflow-name';

/**
 * Queue namespace of every durable agent.
 */
export const DURABLE_HARNESS_AGENT_QUEUE_NAMESPACE = 'harnessagent';

/**
 * Queue prefix of every durable agent: `__harnessagent_wkf_workflow_`.
 *
 * The `__<namespace>_wkf_workflow_` shape is the Workflow SDK's queue naming
 * contract, not a style choice, and the value can't be shortened:
 * - `world.queue()` only accepts queue names matching
 *   `__[<namespace>_]wkf_workflow_<id>`; world-local and world-postgres parse
 *   every queue name with that pattern and reject others;
 * - `registerHandler()` and `registerRoute()` only accept prefixes of that
 *   shape;
 * - the World's recovery of active runs builds the queue name of each run as
 *   `__<queueNamespace>_wkf_workflow_<workflowName>`, from the namespace the
 *   run recorded, so only this shape reaches the queue handler.
 *
 * `wkf_workflow_` names the Workflow SDK's workflow queue kind. The namespace
 * must be lowercase alphanumeric, starting with a letter, which is why it is
 * `harnessagent` without a separator.
 */
export const DURABLE_HARNESS_AGENT_QUEUE_PREFIX =
  `__${DURABLE_HARNESS_AGENT_QUEUE_NAMESPACE}_wkf_workflow_` as const;

/**
 * Default path the queue handler route is mounted at, unless
 * `AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_HANDLER_ROUTE` names another one. API
 * names use "queue"; only this path value uses "flow".
 */
export const DURABLE_HARNESS_AGENT_QUEUE_HANDLER_ROUTE =
  '/.well-known/harness-agent/v1/flow';

/**
 * How the World delivers queue jobs to the durable agents of this process:
 * - `handler`: in this process, through `world.registerHandler()`;
 * - `route`: over HTTP, to the queue handler route, through
 *   `world.registerRoute()`;
 * - `both`: both registrations. A World that has both uses the handler in
 *   its own process; the route reaches the app from a queue worker that has
 *   no handler, e.g. a world-postgres worker in another process.
 */
export type DurableHarnessAgentQueueDelivery = 'handler' | 'route' | 'both';

/**
 * Returns the queue delivery from `AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_DELIVERY`,
 * `handler` if it is unset: an app has no queue handler route unless it says
 * so. Throws for any other value.
 *
 * The variable is read as `process.env.<name>`, never by a computed key, so
 * that a bundler can inline the value an app's build sets (as
 * `withDurableHarnessAgent` does through Next.js's `env` config).
 */
export function getDurableHarnessAgentQueueDelivery(): DurableHarnessAgentQueueDelivery {
  const delivery = process.env.AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_DELIVERY;
  if (delivery == null || delivery === '') return 'handler';
  if (delivery === 'handler' || delivery === 'route' || delivery === 'both') {
    return delivery;
  }
  throw new Error(
    `AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_DELIVERY must be \`handler\`, \`route\` or \`both\`, received \`${delivery}\`.`,
  );
}

/**
 * Returns the path of the queue handler route:
 * `AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_HANDLER_ROUTE`, or
 * `DURABLE_HARNESS_AGENT_QUEUE_HANDLER_ROUTE` if it is unset.
 */
export function getDurableHarnessAgentQueueHandlerRoute(): string {
  return (
    process.env.AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_HANDLER_ROUTE ||
    DURABLE_HARNESS_AGENT_QUEUE_HANDLER_ROUTE
  );
}

/**
 * Seconds a backstop is delayed past the deadline of the drive it covers, so
 * that the drive's process is provably gone once it is delivered.
 */
const BACKSTOP_MARGIN_SECONDS = 5;

/**
 * Seconds after which a queue job is delivered again when no agent is
 * registered under its agent id.
 */
const UNKNOWN_AGENT_RETRY_SECONDS = 5;

/**
 * A queue job: a request for a background drive of one session.
 *
 * On the queue, a queue job is the payload `{ runId }`, sent on
 * `getDurableHarnessAgentQueueName({ agentId })`. The engine's backstops and the
 * World's recovery of active runs both send that (recovery adds fields of
 * its own, which are ignored), so `agentId` is read from the queue name,
 * never from the payload.
 *
 * The Workflow SDK calls a queue job a "queue message", and the ID a queue
 * handler receives as `meta.messageId` is the queue job's ID.
 */
type DurableHarnessAgentQueueJob = {
  /**
   * The workflow run to drive.
   */
  runId: string;

  /**
   * The durable HarnessAgent that owns the workflow run.
   */
  agentId: string;
};

/**
 * Process-wide state of the queue, kept on `globalThis` under a registered
 * symbol, since bundlers may load several copies of this module into one
 * process, and a World must be connected only once.
 */
type DurableHarnessAgentQueueState = {
  /**
   * Worlds connected by `connectDurableHarnessAgentQueue()`.
   */
  connectedWorlds: WeakSet<World>;

  /**
   * The queue request handler of each World it was created for.
   */
  requestHandlers: WeakMap<World, (request: Request) => Promise<Response>>;
};

const STATE_KEY = Symbol.for('@ai-sdk/harness//durable-agent-queue');

/**
 * Sends a queue job for the session on the agent's queue name, delayed
 * past the drive's runtime deadline. Resolves `false` without sending if the
 * World reports no deadline.
 */
export async function sendDurableHarnessAgentBackstop(options: {
  world: World;
  queueJob: DurableHarnessAgentQueueJob;
}): Promise<boolean> {
  const { world, queueJob } = options;
  const deadline = await world.getRuntimeDeadline?.();
  if (deadline == null) return false;
  const delaySeconds =
    Math.max(1, Math.ceil((deadline.getTime() - Date.now()) / 1000)) +
    BACKSTOP_MARGIN_SECONDS;
  await world.queue(
    getDurableHarnessAgentQueueName({ agentId: queueJob.agentId }),
    { runId: queueJob.runId },
    { delaySeconds },
  );
  return true;
}

/**
 * Makes `world` deliver `DURABLE_HARNESS_AGENT_QUEUE_PREFIX` to the durable
 * agents of this process, once per World, as
 * `getDurableHarnessAgentQueueDelivery()` says:
 * `world.registerHandler?.()` to deliver in this process, and/or
 * `world.registerRoute?.()` with the queue handler route's path to deliver
 * over HTTP (world-postgres saves the route with each queue job when it is
 * enqueued). Then starts the World with `world.start?.()`, not awaited,
 * logging a failure, so that the World's recovery runs after the prefix is
 * registered.
 *
 * Delivery over HTTP reaches every durable agent of the app, since the
 * queue handler route imports every module that creates one. Delivery in
 * this process only reaches the agents whose modules this process already
 * loaded; a queue job for another agent is delivered again until its module
 * loads.
 *
 * Called on first use, never on import: importing a module that creates a
 * durable agent (as `next build` does while collecting page data) must not
 * start the World.
 */
export function connectDurableHarnessAgentQueue(options: {
  world: World;
}): void {
  const { world } = options;
  const { connectedWorlds } = getState();
  if (connectedWorlds.has(world)) return;
  const delivery = getDurableHarnessAgentQueueDelivery();
  connectedWorlds.add(world);

  if (delivery !== 'route') {
    world.registerHandler?.(
      DURABLE_HARNESS_AGENT_QUEUE_PREFIX,
      getDurableHarnessAgentQueueRequestHandler({ world }),
    );
  }
  if (delivery !== 'handler') {
    world.registerRoute?.(
      DURABLE_HARNESS_AGENT_QUEUE_PREFIX,
      getDurableHarnessAgentQueueHandlerRoute(),
    );
  }
  world.start?.().catch(error => {
    console.error('[@ai-sdk/harness] Failed to start the World.', error);
  });
}

/**
 * The queue consumer for every durable HarnessAgent in this process. Finds
 * the agent in the durable agent registry by the queue job's agent id and
 * drives its session. Every durable agent in the process must share one
 * World.
 *
 * Responds with 503, which makes the queue deliver the request again, if no
 * durable agent is registered in this process, since the World that decodes
 * the request comes from the registered agents.
 */
export function createDurableHarnessAgentQueueHandler(): (
  request: Request,
) => Promise<Response> {
  return async request => {
    const worlds = new Set(getDurableHarnessAgents().map(agent => agent.world));
    if (worlds.size === 0) {
      console.warn(
        '[@ai-sdk/harness] A queue job arrived before any durable agent was created in this process.',
      );
      return new Response('No durable HarnessAgent is registered.', {
        status: 503,
      });
    }
    if (worlds.size > 1) {
      throw new Error(
        'createDurableHarnessAgentQueueHandler: every durable HarnessAgent in the process must share one World.',
      );
    }
    const [world] = worlds;
    connectDurableHarnessAgentQueue({ world });
    return getDurableHarnessAgentQueueRequestHandler({ world })(request);
  };
}

/**
 * The queue name of every queue job for a durable agent:
 * `${DURABLE_HARNESS_AGENT_QUEUE_PREFIX}${workflowName}`, the name the World's
 * recovery of active runs builds for the agent's runs.
 */
function getDurableHarnessAgentQueueName(options: {
  agentId: string;
}): `${typeof DURABLE_HARNESS_AGENT_QUEUE_PREFIX}workflow//@ai-sdk/harness//${string}` {
  return `${DURABLE_HARNESS_AGENT_QUEUE_PREFIX}${getDurableHarnessAgentWorkflowName(options)}`;
}

/**
 * Reads a queue job as the World delivers it: an untyped payload plus
 * its queue name. Undefined unless the payload is `{ runId: string }` and the
 * queue name is a durable agent's queue name.
 */
function parseDurableHarnessAgentQueueJob(options: {
  payload: unknown;
  queueName: string;
}): DurableHarnessAgentQueueJob | undefined {
  const { payload, queueName } = options;
  if (typeof payload !== 'object' || payload == null) return undefined;
  const { runId } = payload as { runId?: unknown };
  if (typeof runId !== 'string') return undefined;
  const namePrefix =
    DURABLE_HARNESS_AGENT_QUEUE_PREFIX + HARNESS_AGENT_WORKFLOW_NAME_PREFIX;
  if (!queueName.startsWith(namePrefix)) return undefined;
  const agentId = queueName.slice(namePrefix.length);
  if (agentId === '') return undefined;
  return { runId, agentId };
}

/**
 * Runs the background drive a queue job asks for: looks up the agent in the
 * durable agent registry and drives the session under the queue job's ID.
 * The drive sends a backstop for its own deadline. Asks for redelivery in 5
 * seconds if no agent is registered under the agent id.
 */
async function consumeDurableHarnessAgentQueueJob(options: {
  queueJob: DurableHarnessAgentQueueJob;
  queueJobId: string;
}): Promise<void | { timeoutSeconds: number }> {
  const { queueJob, queueJobId } = options;
  const agent = getDurableHarnessAgent({ id: queueJob.agentId });
  if (agent == null) {
    console.warn(
      `[@ai-sdk/harness] No durable agent with the \`id\` \`${queueJob.agentId}\` is registered in this process; the queue job is delivered again in ${UNKNOWN_AGENT_RETRY_SECONDS} seconds.`,
      { runId: queueJob.runId, queueJobId },
    );
    return { timeoutSeconds: UNKNOWN_AGENT_RETRY_SECONDS };
  }
  const session = await agent.createSession({ runId: queueJob.runId });
  await agent.drive({ session, queueJobId });
}

/**
 * Returns the shared process-wide queue state.
 */
function getState(): DurableHarnessAgentQueueState {
  const holder = globalThis as { [STATE_KEY]?: DurableHarnessAgentQueueState };
  holder[STATE_KEY] ??= {
    connectedWorlds: new WeakSet(),
    requestHandlers: new WeakMap(),
  };
  return holder[STATE_KEY];
}

/**
 * Returns the request handler that delivers queue jobs of
 * `DURABLE_HARNESS_AGENT_QUEUE_PREFIX` from `world` to the durable agent registry,
 * created once per World. Queue jobs that are not a durable agent's are
 * logged and dropped.
 */
function getDurableHarnessAgentQueueRequestHandler(options: {
  world: World;
}): (request: Request) => Promise<Response> {
  const { world } = options;
  const { requestHandlers } = getState();
  let requestHandler = requestHandlers.get(world);
  if (requestHandler == null) {
    requestHandler = world.createQueueHandler(
      DURABLE_HARNESS_AGENT_QUEUE_PREFIX,
      // oxlint-disable-next-line ai-sdk/require-object-parameter -- `World` queue callback signature.
      async (payload, meta) => {
        const queueJob = parseDurableHarnessAgentQueueJob({
          payload,
          queueName: meta.queueName,
        });
        if (queueJob == null) {
          console.warn('[@ai-sdk/harness] Ignoring an unknown queue job.', {
            queueName: meta.queueName,
            queueJobId: meta.messageId,
          });
          return;
        }
        return consumeDurableHarnessAgentQueueJob({
          queueJob,
          queueJobId: meta.messageId,
        });
      },
    );
    requestHandlers.set(world, requestHandler);
  }
  return requestHandler;
}
