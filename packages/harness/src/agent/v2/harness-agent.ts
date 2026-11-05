import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import type {
  AgentCallParameters,
  AgentStreamParameters,
  GenerateTextResult,
  OutputInterface as Output,
  StreamTextResult,
} from 'ai';
import type { HarnessAgentSession } from './harness-agent-session';
import type { HarnessAgentSettings } from '../harness-agent-settings';
import type { HarnessV2 } from '../../v2/harness-v2';
import type { HarnessV2SerializableValue } from '../../v2/harness-v2-serializable-value';
import type { World } from '@workflow/world';

interface HarnessAgentCallExtensions {
  session: HarnessAgentSession;
}

type HarnessAllTools<
  THarness extends HarnessV2<any>,
  TUserTools extends ToolSet,
> = Omit<THarness['builtinTools'], keyof TUserTools> & TUserTools;

export class HarnessAgent<
  THarness extends HarnessV2<any> = HarnessV2,
  TUserTools extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
  CALL_OPTIONS = never,
> {
  readonly id: string | undefined;
  readonly tools: HarnessAllTools<THarness, TUserTools>;
  readonly harnessId: string;
  readonly hasOutput = false;

  private readonly harness: HarnessV2<THarness['builtinTools']>;
  private readonly world: World | undefined;
  private readonly isDurable: boolean;

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

    this.world = settings.world;
    this.isDurable = settings.world !== undefined;
    this.id = settings.id;
    this.harnessId = this.harness.harnessId;
    this.tools = {
      ...this.harness.builtinTools,
      ...settings.tools,
    } as HarnessAllTools<THarness, TUserTools>;
  }

  async createSession(): Promise<HarnessAgentSession> {
    throw new Error('Not implemented yet');
  }

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

function isHarnessSerializableValue(input: {
  value: unknown;
  ancestors: WeakSet<object>;
}): input is { value: HarnessV2SerializableValue; ancestors: WeakSet<object> } {
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
