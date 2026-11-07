import { isSerializableValue } from '@ai-sdk/provider';
import {
  generateId,
  type Context,
  type Experimental_SandboxSession as SandboxSession,
  type ToolSet,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type {
  AgentCallParameters,
  AgentStreamParameters,
  GenerateTextResult,
  OutputInterface as Output,
  StreamTextResult,
} from 'ai';
import {
  DefaultHarnessAgentSession,
  type HarnessAgentSession,
} from './harness-agent-session';
import { InMemoryWorld } from './in-memory-world';
import type { HarnessAgentSettings } from '../harness-agent-settings';
import type { HarnessV2 } from '../../v2/harness-v2';
import type { HarnessV2NetworkSandboxSession } from '../../v2/harness-v2-network-sandbox-session';
import type { World } from '@workflow/world';

/**
 * Additional call input required to associate work with an agent session.
 */
interface HarnessAgentCallExtensions {
  /**
   * Session whose sandbox and identity are used for the call.
   */
  session: HarnessAgentSession;
}

/**
 * Combines adapter built-ins with user tools, letting user tools take precedence.
 */
type HarnessAllTools<
  THarness extends HarnessV2<any>,
  TUserTools extends ToolSet,
> = Omit<THarness['builtinTools'], keyof TUserTools> & TUserTools;

/**
 * Consumer-facing agent configured with a HarnessV2 adapter.
 *
 * A supplied `World` makes the agent durable; otherwise it uses an in-memory
 * world. Every session must include a sandbox session and a stable sandbox ID.
 *
 * ```ts
 * const agent = new HarnessAgent({
 *   harness,
 *   world,
 *   getSandboxSession: ({ sandboxId }) => sandboxProvider.getSession({ sandboxId }),
 * });
 * ```
 */
export class HarnessAgent<
  THarness extends HarnessV2<any> = HarnessV2,
  TUserTools extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
  CALL_OPTIONS = never,
> {
  /**
   * Optional application-assigned agent identifier.
   */
  readonly id: string | undefined;

  /**
   * Built-in and user tools available to this agent.
   */
  readonly tools: HarnessAllTools<THarness, TUserTools>;

  /**
   * Identifier of the configured harness adapter.
   */
  readonly harnessId: string;

  /**
   * Whether this agent produces structured output.
   */
  readonly hasOutput = false;

  private readonly harness: HarnessV2<THarness['builtinTools']>;
  private readonly world: World;
  private readonly getSandboxSession: NonNullable<
    HarnessAgentSettings['getSandboxSession']
  >;

  /**
   * Creates the agent from its settings.
   */
  constructor(
    settings: HarnessAgentSettings<
      THarness,
      TUserTools,
      RUNTIME_CONTEXT,
      OUTPUT,
      CALL_OPTIONS
    >,
  ) {
    if (settings.harness.specificationVersion !== 'harness-v2') {
      throw new Error(
        `HarnessAgent: expected \`harness.specificationVersion\` to be \`harness-v2\`, received \`${settings.harness.specificationVersion}\`.`,
      );
    }

    if (typeof settings.getSandboxSession !== 'function') {
      throw new Error(
        'HarnessAgent: `getSandboxSession` is required with HarnessV2.',
      );
    }

    this.harness = settings.harness;

    const unsupportedSetting = Reflect.ownKeys(settings).find(
      key =>
        key !== 'harness' &&
        key !== 'tools' &&
        key !== 'world' &&
        key !== 'getSandboxSession',
    );
    if (unsupportedSetting !== undefined) {
      throw new Error(
        `HarnessAgent: setting \`${String(unsupportedSetting)}\` is not supported.`,
      );
    }

    this.world = settings.world ?? new InMemoryWorld();
    this.getSandboxSession = settings.getSandboxSession;
    this.id = settings.id;
    this.harnessId = this.harness.harnessId;
    this.tools = {
      ...this.harness.builtinTools,
      ...settings.tools,
    } as HarnessAllTools<THarness, TUserTools>;
  }

  /**
   * Creates a session associated with a sandbox and a stable sandbox ID.
   *
   * Uses the sandbox session's ID when available, otherwise `options.sandboxId`.
   * A sandbox session object is optional; when omitted, it is resolved lazily
   * from the stable sandbox ID.
   */
  async createSession(options: {
    sessionId?: string;
    sandboxId?: string;
    sandboxSession?: SandboxSession | HarnessV2NetworkSandboxSession;
  }): Promise<HarnessAgentSession> {
    const sandboxSession = options.sandboxSession;
    const sandboxSessionId =
      sandboxSession == null ? undefined : getSandboxId({ sandboxSession });
    if (
      options.sandboxId != null &&
      sandboxSessionId != null &&
      options.sandboxId !== sandboxSessionId
    ) {
      throw new Error(
        'HarnessAgent.createSession: `sandboxId` must match the sandbox session `id` when one is available.',
      );
    }

    const sandboxId = sandboxSessionId ?? options.sandboxId;
    if (sandboxId == null) {
      throw new Error(
        'HarnessAgent.createSession: a stable `sandboxId` is required when `sandboxSession` is omitted or has no `id`.',
      );
    }

    const sessionId = options.sessionId ?? generateId();
    const session = new DefaultHarnessAgentSession({
      sessionId,
      sandboxId,
      sandboxSession,
    });
    this.bindSession({ session });
    return session;
  }

  /**
   * Binds this agent's sandbox resolver before operating on a session.
   */
  private bindSession(input: { session: HarnessAgentSession }): void {
    input.session.setSandboxSessionResolver(this.getSandboxSession);
  }

  /**
   * Validates call-option serializability, then reports that generation is not
   * implemented in this scaffold.
   */
  async generate(
    options: AgentCallParameters<
      CALL_OPTIONS,
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT
    > &
      HarnessAgentCallExtensions,
  ): Promise<
    GenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    assertCallOptionsSerializable({ options });
    this.bindSession({ session: options.session });
    throw new Error('Not implemented yet');
  }

  /**
   * Validates call-option serializability, then reports that streaming is not
   * implemented in this scaffold.
   */
  async stream(
    options: AgentStreamParameters<
      CALL_OPTIONS,
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT
    > &
      HarnessAgentCallExtensions,
  ): Promise<
    StreamTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    assertCallOptionsSerializable({ options });
    this.bindSession({ session: options.session });
    throw new Error('Not implemented yet');
  }
}

/**
 * Returns a sandbox session's string ID when it exposes one.
 */
function getSandboxId(input: {
  sandboxSession: SandboxSession | HarnessV2NetworkSandboxSession;
}): string | undefined {
  if (!('id' in input.sandboxSession)) return undefined;
  return typeof input.sandboxSession.id === 'string'
    ? input.sandboxSession.id
    : undefined;
}

/**
 * Validates that call options are plain data objects with serializable values.
 *
 * The options object must have a plain or null prototype, and each own property
 * must be a data property whose value passes `isHarnessSerializableValue`.
 * Accessors, custom prototypes, and unsupported nested values cause an error.
 */
function assertCallOptionsSerializable(input: { options: object }): void {
  const prototype = Object.getPrototypeOf(input.options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('HarnessAgent: call options must be serializable.');
  }

  for (const key of Reflect.ownKeys(input.options)) {
    const descriptor = Object.getOwnPropertyDescriptor(input.options, key);
    if (
      descriptor == null ||
      !('value' in descriptor) ||
      !isHarnessSerializableValue({
        value: descriptor.value,
        ancestors: new WeakSet(),
      })
    ) {
      throw new Error(
        `HarnessAgent: call option \`${String(key)}\` must be serializable.`,
      );
    }
  }
}

/**
 * Checks recursively whether a value belongs to the supported serializable
 * subset.
 *
 * Primitive values, supported built-ins, arrays, maps, sets, and plain objects
 * with string-keyed data properties are accepted. Class instances are accepted
 * when their constructor defines `WORKFLOW_SERIALIZE`; other class instances,
 * cycles, accessors, and symbol keys on nested objects are rejected.
 * Container recursion stays local so Workflow hooks are honored at every depth;
 * non-container values are checked by the shared `isSerializableValue` guard.
 */
function isHarnessSerializableValue(input: {
  value: unknown;
  ancestors: WeakSet<object>;
}): boolean {
  const { value, ancestors } = input;

  if (value === null || typeof value !== 'object') {
    return isSerializableValue(value);
  }

  if (ancestors.has(value)) return false;
  ancestors.add(value);

  try {
    const constructor = Object.getPrototypeOf(value)?.constructor;
    const workflowSerialize =
      typeof constructor === 'function'
        ? Reflect.get(constructor, WORKFLOW_SERIALIZE)
        : undefined;

    if (typeof workflowSerialize === 'function') {
      return isHarnessSerializableValue({
        value: workflowSerialize.call(constructor, value),
        ancestors,
      });
    }

    if (Array.isArray(value)) {
      return value.every(item =>
        isHarnessSerializableValue({ value: item, ancestors }),
      );
    }

    if (value instanceof Map) {
      return Array.from(value.entries()).every(
        ([key, item]) =>
          isHarnessSerializableValue({ value: key, ancestors }) &&
          isHarnessSerializableValue({ value: item, ancestors }),
      );
    }

    if (value instanceof Set) {
      return Array.from(value.values()).every(item =>
        isHarnessSerializableValue({ value: item, ancestors }),
      );
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      return Reflect.ownKeys(value).every(key => {
        if (typeof key !== 'string') return false;

        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return (
          descriptor != null &&
          'value' in descriptor &&
          isHarnessSerializableValue({ value: descriptor.value, ancestors })
        );
      });
    }

    return isSerializableValue(value);
  } finally {
    ancestors.delete(value);
  }
}
