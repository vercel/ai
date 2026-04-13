/**
 * Serializes a language model instance for workflow step boundaries.
 * Extracts the modelId and only the serializable config properties,
 * filtering out functions (headers, fetch, generateId, etc.) and
 * objects containing functions (errorStructure, metadataExtractor, etc.).
 *
 * Used as the body of `static [WORKFLOW_SERIALIZE]` in provider models.
 *
 * @example
 * ```ts
 * static [WORKFLOW_SERIALIZE](model: MyLanguageModel) {
 *   return serializeModel(model);
 * }
 * ```
 */
export function serializeModel<MODEL extends { modelId: string }>({
  model,
  getConfig,
}: {
  model: MODEL;
  getConfig: (model: MODEL) => Record<string, unknown>;
}): {
  modelId: string;
  config: Record<string, unknown>;
} {
  const config: Record<string, unknown> = {};
  const modelConfig = getConfig(model);
  for (const key of Object.keys(modelConfig)) {
    const value = modelConfig[key];
    if (isSerializable(value)) {
      config[key] = value;
    } else if (key === 'headers' && typeof value === 'function') {
      // Resolve headers at serialization time so auth credentials
      // survive the workflow step boundary. On deserialization the
      // resolved object is wrapped back into a function.
      const resolved = value();
      if (isSerializable(resolved)) {
        config[key] = resolved;
      }
    }
  }
  return { modelId: model.modelId, config };
}

/**
 * Deserializes a model instance from workflow step boundary data.
 * The symmetric opposite of `serializeModel`: accepts a model class
 * constructor and the serialized `{ modelId, config }` payload, and
 * returns a fully constructed model instance.
 *
 * Internally wraps plain-object `headers` back into a function before
 * passing the config to the constructor.
 *
 * Used as the body of `static [WORKFLOW_DESERIALIZE]` in provider models.
 *
 * @example
 * ```ts
 * static [WORKFLOW_DESERIALIZE](options: { modelId: string; config: MyConfig }) {
 *   return deserializeModel(MyLanguageModel, options);
 * }
 * ```
 */
export function deserializeModel<
  MODEL extends { modelId: string },
  CONFIG extends Record<string, unknown>,
>({
  ModelClass,
  options,
}: {
  ModelClass: new (modelId: string, config: CONFIG) => MODEL;
  options: { modelId: string; config: CONFIG };
}): MODEL {
  return new ModelClass(options.modelId, options.config);
}

// TODO extract, test, is JSON Value
function isSerializable(value: unknown): boolean {
  if (value === null || value === undefined) return true;

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return true;
  if (type === 'function' || type === 'symbol' || type === 'bigint')
    return false;

  if (Array.isArray(value)) {
    return value.every(isSerializable);
  }

  // Only allow plain objects (not class instances like RegExp, Date, etc.)
  if (Object.getPrototypeOf(value) === Object.prototype) {
    return Object.values(value as Record<string, unknown>).every(
      isSerializable,
    );
  }

  return false;
}
