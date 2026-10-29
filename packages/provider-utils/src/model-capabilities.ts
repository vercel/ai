/**
 * Matches normalized model IDs. A string or an array of strings matches IDs
 * exactly, and a regular expression is tested against the normalized ID.
 */
export type ModelCapabilitiesMatch = string | readonly string[] | RegExp;

export type ModelCapabilitiesEntry<CAPABILITIES> = {
  match: ModelCapabilitiesMatch;
  capabilities: CAPABILITIES;
};

/**
 * Capabilities of the models of one provider and model type, created with
 * `defineModelCapabilities` and read with `getModelCapabilities`.
 */
export type ModelCapabilities<CAPABILITIES> = {
  readonly normalize: (modelId: string) => string;
  readonly exactMatches: ReadonlyMap<string, CAPABILITIES>;
  readonly patternMatches: ReadonlyArray<{
    pattern: RegExp;
    capabilities: CAPABILITIES;
  }>;
  readonly fallback: (modelId: string) => CAPABILITIES;
};

/**
 * Defines the capabilities of the models of one provider and model type.
 *
 * Model IDs are normalized and then matched against the entries. Exact string
 * matches are checked before regular expressions, so an entry for
 * `claude-opus-5-5` is never shadowed by a pattern for `claude-opus-5`.
 * Regular expressions are tested in the order of the entries.
 *
 * @param options.normalize - Maps a model ID to the form that is used for
 * matching, e.g. by removing snapshot dates. Defaults to the identity.
 * @param options.entries - The capabilities of known models.
 * @param options.fallback - The capabilities of unknown models. Receives the
 * original model ID.
 */
export function defineModelCapabilities<CAPABILITIES>({
  normalize = modelId => modelId,
  entries,
  fallback,
}: {
  normalize?: (modelId: string) => string;
  entries: ReadonlyArray<ModelCapabilitiesEntry<CAPABILITIES>>;
  fallback: (modelId: string) => CAPABILITIES;
}): ModelCapabilities<CAPABILITIES> {
  const exactMatches = new Map<string, CAPABILITIES>();
  const patternMatches: Array<{ pattern: RegExp; capabilities: CAPABILITIES }> =
    [];

  for (const { match, capabilities } of entries) {
    if (match instanceof RegExp) {
      patternMatches.push({ pattern: match, capabilities });
      continue;
    }

    for (const modelId of typeof match === 'string' ? [match] : match) {
      if (exactMatches.has(modelId)) {
        throw new Error(`Duplicate model capabilities for "${modelId}".`);
      }
      exactMatches.set(modelId, capabilities);
    }
  }

  return { normalize, exactMatches, patternMatches, fallback };
}

/**
 * Returns the capabilities of a model.
 *
 * @returns The capabilities, and whether they come from a known model entry
 * (`true`) or from the fallback (`false`).
 */
export function getModelCapabilities<CAPABILITIES>(
  modelCapabilities: ModelCapabilities<CAPABILITIES>,
  modelId: string,
): { capabilities: CAPABILITIES; isKnownModel: boolean } {
  const normalizedModelId = modelCapabilities.normalize(modelId);

  const exactMatch = modelCapabilities.exactMatches.get(normalizedModelId);
  if (exactMatch !== undefined) {
    return { capabilities: exactMatch, isKnownModel: true };
  }

  for (const { pattern, capabilities } of modelCapabilities.patternMatches) {
    if (pattern.test(normalizedModelId)) {
      return { capabilities, isKnownModel: true };
    }
  }

  return {
    capabilities: modelCapabilities.fallback(modelId),
    isKnownModel: false,
  };
}
