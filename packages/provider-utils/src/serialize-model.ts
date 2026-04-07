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
export function serializeModel(inst: any): {
  modelId: string;
  config: Record<string, unknown>;
} {
  const config: Record<string, unknown> = {};
  for (const key of Object.keys(inst.config)) {
    const value = inst.config[key];
    if (isSerializable(value)) {
      config[key] = value;
    }
  }
  return { modelId: inst.modelId, config };
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
