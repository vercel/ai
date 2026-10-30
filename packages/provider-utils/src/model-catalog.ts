// This file must not have runtime imports: the docs generator loads provider
// catalogs from source and resolves `@ai-sdk/provider-utils` to this file.

/**
 * Matches model IDs after normalization. A string or an array of strings
 * matches IDs exactly. A regular expression matches a model family.
 */
export type ModelCatalogMatch = string | readonly string[] | RegExp;

export type ModelCatalogEntry<CAPABILITIES> = {
  readonly match: ModelCatalogMatch;
  readonly capabilities: CAPABILITIES;
};

/**
 * The capabilities of one provider's models of one model type, created with
 * `defineModelCatalog` and read with `getModelCapabilities`.
 */
export type ModelCatalog<CAPABILITIES> = {
  /**
   * Capabilities of the models that entries list by exact ID. Documentation
   * is generated from these models.
   */
  readonly knownModels: Readonly<Record<string, CAPABILITIES>>;
  readonly normalize: (modelId: string) => string;
  readonly patterns: ReadonlyArray<{
    readonly pattern: RegExp;
    readonly capabilities: CAPABILITIES;
  }>;
  readonly fallback: (modelId: string) => CAPABILITIES;
};

/**
 * Defines the capabilities of one provider's models of one model type.
 *
 * Model IDs are normalized and then matched against the entries. Exact IDs
 * are checked before regular expressions, so an entry for `claude-opus-5-5`
 * is never shadowed by a pattern for `claude-opus-5`. Regular expressions are
 * tested in the order of the entries.
 *
 * Unknown models get the capabilities returned by `fallback`. Fallback
 * capabilities should be broad: the provider sends what the caller requested
 * and leaves validation to the API.
 *
 * @param options.normalize - Maps a model ID to the form used for matching,
 * e.g. by removing a snapshot date. Defaults to the identity.
 * @param options.entries - The capabilities of known models and families.
 * @param options.fallback - The capabilities of unknown models. Receives the
 * original model ID.
 */
export function defineModelCatalog<CAPABILITIES>({
  normalize = modelId => modelId,
  entries,
  fallback,
}: {
  normalize?: (modelId: string) => string;
  entries: ReadonlyArray<ModelCatalogEntry<CAPABILITIES>>;
  fallback: (modelId: string) => CAPABILITIES;
}): ModelCatalog<CAPABILITIES> {
  const knownModels: Record<string, CAPABILITIES> = {};
  const patterns: Array<{ pattern: RegExp; capabilities: CAPABILITIES }> = [];

  for (const { match, capabilities } of entries) {
    if (match instanceof RegExp) {
      patterns.push({ pattern: match, capabilities });
      continue;
    }

    for (const modelId of typeof match === 'string' ? [match] : match) {
      if (Object.prototype.hasOwnProperty.call(knownModels, modelId)) {
        throw new Error(`Duplicate model catalog entry for "${modelId}".`);
      }
      knownModels[modelId] = capabilities;
    }
  }

  return { knownModels, normalize, patterns, fallback };
}

/**
 * Returns the capabilities of a model.
 *
 * @returns The capabilities, and whether they come from a catalog entry
 * (`true`) or from the fallback (`false`).
 */
export function getModelCapabilities<CAPABILITIES>(
  catalog: ModelCatalog<CAPABILITIES>,
  modelId: string,
): { capabilities: CAPABILITIES; isKnownModel: boolean } {
  const normalizedModelId = catalog.normalize(modelId);

  if (
    Object.prototype.hasOwnProperty.call(catalog.knownModels, normalizedModelId)
  ) {
    return {
      capabilities: catalog.knownModels[normalizedModelId],
      isKnownModel: true,
    };
  }

  for (const { pattern, capabilities } of catalog.patterns) {
    if (pattern.test(normalizedModelId)) {
      return { capabilities, isKnownModel: true };
    }
  }

  return { capabilities: catalog.fallback(modelId), isKnownModel: false };
}

/**
 * Language model capabilities that every provider catalog declares with the
 * same meaning. Provider catalogs extend these with their own capabilities.
 */
export type LanguageModelCapabilities = {
  readonly inputs: {
    readonly image: boolean;
    readonly audio: boolean;
  };
  readonly objectGeneration: boolean;
  readonly tools: {
    readonly usage: boolean;
    readonly streaming: boolean;
  };
  /**
   * Reasoning support, or `undefined` for models that do not reason.
   */
  readonly reasoning:
    | {
        /**
         * Reasoning efforts that the model accepts, or `undefined` when they
         * are not declared.
         */
        readonly efforts?: readonly string[];
      }
    | undefined;
};

export type EmbeddingModelCapabilities = {
  readonly defaultDimensions: number;
  readonly customDimensions: boolean;
};

export type ImageModelCapabilities = {
  /**
   * Supported sizes. `custom` means standard presets and custom dimensions.
   * `undefined` means the sizes are not declared.
   */
  readonly sizes: readonly string[] | 'custom' | undefined;
  /** `undefined` means support is not known. */
  readonly fileInput: boolean | undefined;
  /** `undefined` means support is not known. */
  readonly maskInput: boolean | undefined;
  readonly maxImagesPerCall: number;
};

export type TranscriptionModelCapabilities = {
  /** Transcribes complete audio files. */
  readonly transcription: boolean;
  readonly streaming: boolean;
  /** Accepts a streaming delay setting. */
  readonly streamingDelay: boolean;
  readonly duration: boolean;
  readonly segments: boolean;
  readonly language: boolean;
};

export type SpeechModelCapabilities = {
  readonly instructions: boolean;
};

export type SpeechTranslationModelCapabilities = {
  readonly translatedAudio: boolean;
  readonly translatedText: boolean;
  readonly sourceTranscript: boolean;
};

export type RealtimeModelCapabilities = {
  readonly conversation: 'continuous' | 'turn-based';
  readonly transports: readonly ('websocket' | 'webrtc')[];
  readonly connections: readonly (
    | 'client-secret-websocket'
    | 'server-websocket'
    | 'webrtc'
  )[];
};
