import {
  generateId,
  type Context,
  type Experimental_SandboxSession as SandboxSession,
  type SerializableValue,
  type ToolSet,
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
  DurableHarnessAgentSession,
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
  private readonly isDurable: boolean;
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
    this.isDurable = !(this.world instanceof InMemoryWorld);
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
   * The ID comes from `sandboxSession.id` when available, otherwise from
   * `options.sandboxId`; conflicting IDs or a missing stable ID are rejected.
   * In-memory worlds retain the supplied session object, while other worlds
   * reacquire it through the configured provider.
   */
  async createSession(options: {
    sessionId?: string;
    sandboxId?: string;
    sandboxSession?: SandboxSession | HarnessV2NetworkSandboxSession;
  }): Promise<HarnessAgentSession> {
    const sandboxSession = options.sandboxSession;
    if (sandboxSession == null) {
      throw new Error(
        'HarnessAgent.createSession: `sandboxSession` is required with HarnessV2.',
      );
    }

    const sandboxSessionId = getSandboxId({ sandboxSession });
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
        'HarnessAgent.createSession: a stable `sandboxId` is required when the sandbox session has no `id`.',
      );
    }

    const sessionId = options.sessionId ?? generateId();

    if (this.isDurable) {
      return new DurableHarnessAgentSession({
        sessionId,
        sandboxId,
        getSandboxSession: this.getSandboxSession,
      });
    }

    return new DefaultHarnessAgentSession({
      sessionId,
      sandboxId,
      sandboxSession,
    });
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
 * with string-keyed data properties are accepted. Cycles, accessors, symbol
 * keys on nested objects, and other class instances are rejected.
 */
function isHarnessSerializableValue(input: {
  value: unknown;
  ancestors: WeakSet<object>;
}): input is { value: SerializableValue; ancestors: WeakSet<object> } {
  const { value, ancestors } = input;

  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return true;
  }

  if (typeof value !== 'object') return false;

  if (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof URL ||
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  ) {
    return true;
  }

  if (ancestors.has(value)) return false;
  ancestors.add(value);

  let serializable: boolean;
  if (Array.isArray(value)) {
    serializable = value.every(item =>
      isHarnessSerializableValue({ value: item, ancestors }),
    );
  } else if (value instanceof Map) {
    serializable = Array.from(value.entries()).every(
      ([key, item]) =>
        isHarnessSerializableValue({ value: key, ancestors }) &&
        isHarnessSerializableValue({ value: item, ancestors }),
    );
  } else if (value instanceof Set) {
    serializable = Array.from(value.values()).every(item =>
      isHarnessSerializableValue({ value: item, ancestors }),
    );
  } else {
    const prototype = Object.getPrototypeOf(value);
    serializable =
      (prototype === Object.prototype || prototype === null) &&
      Reflect.ownKeys(value).every(key => {
        if (typeof key !== 'string') return false;

        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return (
          descriptor != null &&
          'value' in descriptor &&
          isHarnessSerializableValue({ value: descriptor.value, ancestors })
        );
      });
  }

  ancestors.delete(value);
  return serializable;
}
