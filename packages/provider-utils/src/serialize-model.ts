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
export function serializeModelOptions<
  CONFIG extends {
    headers?: () => Record<string, string | undefined>;
  },
>(options: {
  modelId: string;
  config: CONFIG;
}): {
  modelId: string;
  config: JSONObject;
} {
  const serializableConfig: JSONObject = {};
  for (const [key, value] of Object.entries(options.config)) {
    if (key === 'headers') {
      const resolvedHeaders = value();
      if (isJSONSerializable(resolvedHeaders)) {
        serializableConfig[key] = resolvedHeaders;
      }
    } else if (isJSONSerializable(value)) {
      serializableConfig[key] = value;
    }
  }
  return { modelId: options.modelId, config: serializableConfig };
}

/**
 * Deserializes model options from workflow step boundary data.
 * Restores special-case config values, such as converting a
 * serialized `headers` object back into a function.
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
export function deserializeModelOptions<
  CONFIG extends {
    headers?: () => Record<string, string | undefined>;
  },
>(options: {
  modelId: string;
  config: CONFIG;
}): {
  modelId: string;
  config: CONFIG;
} {
  const result = { ...options.config };

  // TODO this is not fully type safe - it would be better to have types
  // for the serialized config
  if (result.headers != null && typeof result.headers !== 'function') {
    const resolvedHeaders = result.headers;
    result.headers = () => resolvedHeaders;
  }

  return { modelId: options.modelId, config: result };
}
