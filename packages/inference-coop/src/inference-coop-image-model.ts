import { OpenAICompatibleImageModel } from '@ai-sdk/openai-compatible';
import type { ImageModelV4 } from '@ai-sdk/provider';
import { WORKFLOW_DESERIALIZE } from '@ai-sdk/provider-utils';
import { INFERENCE_COOP_DEFAULT_BASE_URL } from './inference-coop-config';
import type { InferenceCoopImageModelId } from './inference-coop-image-model-options';

type InferenceCoopImageConfig = Omit<
  ConstructorParameters<typeof OpenAICompatibleImageModel>[1],
  'url'
> & {
  url?: ConstructorParameters<typeof OpenAICompatibleImageModel>[1]['url'];

  /**
   * Serializable base URL of the gateway. The `url` function is dropped by
   * workflow serialization, so it is rebuilt from this value on
   * deserialization.
   */
  baseURL?: string;
};

/**
 * Inference Cooperative image generation over the OpenAI-compatible
 * `/images/generations` endpoint. The gateway returns base64-encoded JPEGs,
 * which the shared OpenAI-compatible implementation handles unchanged.
 */
export class InferenceCoopImageModel
  extends OpenAICompatibleImageModel
  implements ImageModelV4
{
  constructor(
    modelId: InferenceCoopImageModelId,
    config: InferenceCoopImageConfig,
  ) {
    super(modelId, {
      ...config,
      url:
        config.url ??
        (({ path }) =>
          `${config.baseURL ?? INFERENCE_COOP_DEFAULT_BASE_URL}${path}`),
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: InferenceCoopImageModelId;
    config: InferenceCoopImageConfig;
  }) {
    return new InferenceCoopImageModel(options.modelId, options.config);
  }
}
