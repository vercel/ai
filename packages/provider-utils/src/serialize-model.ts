import { JSONObject } from '@ai-sdk/provider';
import { isJSONSerializable } from './is-json-serializable';

/**
 * Serializes a model instance for workflow step boundaries.
 * Returns the modelId plus the JSON-serializable config properties
 * from `getConfig(model)`.
 *
 * Non-serializable values are omitted. As a special case, a
 * function-valued `headers` property is resolved during serialization
 * and included if the returned value is JSON-serializable.
 *
 * Used as the body of `static [WORKFLOW_SERIALIZE]` in provider models.
 *
 * @example
 * ```ts
 * static [WORKFLOW_SERIALIZE](model: MyLanguageModel) {
 *   return serializeModel({
 *     model,
 *     getConfig: model => model.config,
 *   });
 * }
 * ```
 */
export function serializeModel<
  MODEL_ID extends string,
  MODEL extends { modelId: MODEL_ID },
  CONFIG extends object,
>({
  model,
  getConfig,
}: {
  model: MODEL;
  getConfig: (model: MODEL) => CONFIG;
}): {
  modelId: MODEL_ID;
  config: JSONObject;
} {
  const resolvedConfig = getConfig(model);
  const serializableConfig: JSONObject = {};
  for (const [key, value] of Object.entries(
    resolvedConfig as Record<string, unknown>,
  )) {
    if (isJSONSerializable(value)) {
      serializableConfig[key] = value;
    } else if (key === 'headers' && typeof value === 'function') {
      // Resolve headers at serialization time so auth credentials
      // survive the workflow step boundary. On deserialization the
      // resolved object is wrapped back into a function.
      const resolvedHeaders = value();
      if (isJSONSerializable(resolvedHeaders)) {
        serializableConfig[key] = resolvedHeaders;
      }
    }
  }
  return { modelId: model.modelId, config: serializableConfig };
}

/**
 * Deserializes a model instance from workflow step boundary data.
 * Accepts a model class constructor and the serialized
 * `{ modelId, config }` payload, then returns a constructed model
 * instance by passing the config through unchanged.
 *
 * Used as the body of `static [WORKFLOW_DESERIALIZE]` in provider models.
 *
 * @example
 * ```ts
 * static [WORKFLOW_DESERIALIZE](options: { modelId: string; config: MyConfig }) {
 *   return deserializeModel({
 *     ModelClass: MyLanguageModel,
 *     options,
 *   });
 * }
 * ```
 */
export function deserializeModel<MODEL, MODEL_ID extends string, CONFIG>({
  ModelClass,
  options,
}: {
  ModelClass: new (modelId: MODEL_ID, config: CONFIG) => MODEL;
  options: { modelId: MODEL_ID; config: CONFIG };
}): MODEL {
  return new ModelClass(options.modelId, options.config);
}
