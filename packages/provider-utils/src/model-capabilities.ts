import type {
  ModelCapabilities,
  ModelCapability,
  ProviderOptionDefinition,
} from '@ai-sdk/provider';

export type ModelCapabilityEndpoint<
  Operation extends keyof ModelCapabilities,
  Options extends string = never,
  Capabilities = NonNullable<ModelCapabilities[Operation]>,
> = {
  readonly operation: Operation;
  readonly capabilities: Capabilities;
  readonly providerOptions: {
    readonly [Option in Options]: ProviderOptionDefinition & {
      readonly support: ModelCapability;
    };
  };
};

/** Describes one declared endpoint, preserving provider-specific capability types. */
export function createModelCapabilitiesEndpoint<
  Operation extends keyof ModelCapabilities,
  Capabilities extends Partial<NonNullable<ModelCapabilities[Operation]>>,
  Options extends string = never,
>(
  operation: Operation,
  capabilities: Capabilities | undefined,
  definitions: Readonly<
    Record<Options, ProviderOptionDefinition>
  > = {} as Record<Options, ProviderOptionDefinition>,
  support: Partial<Record<NoInfer<Options>, ModelCapability>> = {},
): ModelCapabilityEndpoint<Operation, Options, Capabilities> | undefined {
  if (capabilities == null) return undefined;
  return {
    operation,
    capabilities,
    providerOptions: Object.fromEntries(
      (Object.keys(definitions) as Options[]).map(option => [
        option,
        { ...definitions[option], support: support[option] ?? 'unknown' },
      ]),
    ) as ModelCapabilityEndpoint<
      Operation,
      Options,
      Capabilities
    >['providerOptions'],
  };
}

/** Omits undeclared endpoints and isolates public data from request policies. */
export function createModelCapabilities<
  Provider extends string,
  Endpoints extends Record<string, unknown>,
>(provider: Provider, modelId: string, endpoints: Endpoints) {
  const declared = Object.fromEntries(
    Object.entries(endpoints).filter(([, endpoint]) => endpoint != null),
  );
  return Object.keys(declared).length === 0
    ? undefined
    : {
        provider,
        modelId,
        endpoints: structuredClone(declared) as Endpoints,
      };
}

/** Applies default support to provider options, preserving explicit exceptions. */
export function declareModelProviderOptions<Option extends string>(
  definitions: Readonly<Record<Option, ProviderOptionDefinition>>,
  support: ModelCapability,
  exceptions: Partial<Record<NoInfer<Option>, ModelCapability>>,
): Record<Option, ModelCapability> {
  return Object.fromEntries(
    (Object.keys(definitions) as Option[]).map(option => [
      option,
      exceptions[option] ?? support,
    ]),
  ) as Record<Option, ModelCapability>;
}
