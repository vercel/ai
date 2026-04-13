import { JSONObject } from '@ai-sdk/provider';
import { isJSONSerializable } from './is-json-serializable';

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
  config: JSONObject;
} {
  const resolvedConfig = getConfig(model);
  const serializableConfig: JSONObject = {};
  for (const key of Object.keys(resolvedConfig)) {
    const value = resolvedConfig[key];
    if (isJSONSerializable(value)) {
      serializableConfig[key] = value;
    } else if (key === 'headers' && typeof value === 'function') {
      // Resolve headers at serialization time so auth credentials
      // survive the workflow step boundary. On deserialization the
      // resolved object is wrapped back into a function.
      const resolved = value();
      if (isJSONSerializable(resolved)) {
        serializableConfig[key] = resolved;
      }
    }
  }
  return { modelId: model.modelId, config: serializableConfig };
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
export function deserializeModel<MODEL, CONFIG>({
  ModelClass,
  options,
}: {
  ModelClass: new (modelId: string, config: CONFIG) => MODEL;
  options: { modelId: string; config: CONFIG };
}): MODEL {
  return new ModelClass(options.modelId, options.config);
}
