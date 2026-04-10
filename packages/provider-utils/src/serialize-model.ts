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
 * static [WORKFLOW_SERIALIZE](inst: MyLanguageModel) {
 *   return serializeModel(inst);
 * }
 * ```
 */
// Parameter uses `any` because provider model classes declare `config` as
// private, making it invisible to external type checks.  The static
// WORKFLOW_SERIALIZE method has runtime access to the field regardless.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeModel(model: any): {
  modelId: string;
  config: Record<string, unknown>;
} {
  const config: Record<string, unknown> = {};
  for (const key of Object.keys(model.config)) {
    const value = model.config[key];
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
 * Prepares a deserialized model config for use with a model constructor.
 * Wraps plain-object `headers` back into a function, since model code
 * expects `config.headers()` to be callable.
 *
 * Used inside `static [WORKFLOW_DESERIALIZE]` in provider models.
 *
 * @example
 * ```ts
 * static [WORKFLOW_DESERIALIZE](options: { modelId: string; config: MyConfig }) {
 *   return new MyLanguageModel(options.modelId, deserializeModelConfig(options.config));
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deserializeModelConfig<T>(config: T): T {
  const result = { ...config } as any;
  if (result.headers != null && typeof result.headers !== 'function') {
    const resolvedHeaders = result.headers;
    result.headers = () => resolvedHeaders;
  }
  return result;
}

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
