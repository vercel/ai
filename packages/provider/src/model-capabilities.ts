/**
 * Support declared by a provider's model catalog.
 *
 * `unknown` is distinct from unsupported. A condition describes when support is
 * available; it is documentation, not an expression to execute. Providers remain
 * responsible for evaluating their typed request policies.
 */
export type ModelCapability =
  | boolean
  | 'unknown'
  | { readonly condition: string };

/**
 * Model metadata shared by provider implementations and generated documentation.
 *
 * These declarations describe the capabilities exposed by the provider. They do
 * not introduce validation or change request behavior. Provider catalogs keep
 * protocol details and request configuration alongside this metadata, and may
 * resolve different entries for different API endpoints.
 *
 * This contract is intentionally independent of the versioned model interfaces.
 * Providers can adopt it without requiring changes to existing model objects.
 */
export type ModelCapabilities = {
  /** Omitted sections are undeclared, not explicitly unsupported. */
  readonly language?: {
    readonly inputs: {
      readonly image: ModelCapability;
      readonly audio: ModelCapability;
    };
    readonly objectGeneration: ModelCapability;
    readonly tools: {
      readonly usage: ModelCapability;
      readonly streaming: ModelCapability;
    };
    readonly reasoning: {
      readonly support: ModelCapability;
      /** Omission means the provider does not declare an exhaustive list. */
      readonly efforts?: readonly string[];
    };
    readonly sampling: {
      readonly temperature: ModelCapability;
      readonly topP: ModelCapability;
      readonly logprobs: ModelCapability;
    };
  };
  readonly embedding?: {
    readonly defaultDimensions: number;
    readonly customDimensions: ModelCapability;
  };
  readonly image?: {
    readonly sizes: readonly string[] | { readonly description: string };
    readonly fileInput: ModelCapability;
    readonly maskInput: ModelCapability;
    readonly maxImagesPerCall: number | undefined;
  };
  readonly transcription?: {
    readonly transcription: ModelCapability;
    readonly streaming: ModelCapability;
    readonly duration: ModelCapability;
    readonly segments: ModelCapability;
    readonly language: ModelCapability;
    readonly streamingDelay?: ModelCapability;
  };
  readonly speechTranslation?: {
    readonly translatedAudio: ModelCapability;
    readonly translatedText: ModelCapability;
    readonly sourceTranscript: ModelCapability;
  };
  readonly speech?: {
    readonly instructions: ModelCapability;
  };
  readonly realtime?: {
    readonly conversation: 'continuous' | 'turn-based';
    readonly transports: readonly ('websocket' | 'webrtc')[];
    readonly connections: readonly (
      | 'client-secret-websocket'
      | 'server-websocket'
      | 'webrtc'
    )[];
  };
};

/**
 * A provider option, declared once at the provider level.
 */
export type ProviderOptionDefinition = {
  readonly description: string;
};

/**
 * The provider options a provider accepts, grouped by the operation they
 * configure. Section names match `ModelCapabilities`; option names match the
 * keys accepted under `providerOptions.<provider>` for that operation.
 */
export type ProviderOptionDefinitions = {
  readonly [Section in keyof ModelCapabilities]?: Readonly<
    Record<string, ProviderOptionDefinition>
  >;
};

/**
 * Per-model support for the options in the provider's
 * `ProviderOptionDefinitions`, keyed by the same sections and option names.
 */
export type ModelProviderOptions = {
  readonly [Section in keyof ModelCapabilities]?: Readonly<
    Record<string, ModelCapability>
  >;
};

/**
 * One provider-owned model record, which can declare several operations.
 * RequestConfig is a provider-defined type for request encoding and defaults.
 * Feature support belongs in capabilities, including provider-specific features.
 */
export type ModelEntry<RequestConfig = never> = {
  readonly capabilities: ModelCapabilities;
  /** Omitted sections or options are undeclared, not explicitly unsupported. */
  readonly providerOptions?: ModelProviderOptions;
  readonly requestConfig?: RequestConfig;
};
