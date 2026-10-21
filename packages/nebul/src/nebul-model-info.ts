import {
  createJsonErrorResponseHandler,
  getErrorMessage,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * A model available on the Nebul Inference API.
 */
export interface NebulModelInfo {
  /**
   * Model identifier to pass to the model factories,
   * e.g. `nebul.chat('zai-org/GLM-5.3-Flash')`.
   */
  id: string;

  /**
   * High-level model category, e.g. `'llm'`, `'embedding'`, `'audio'`,
   * `'image'`, or `'reranker'`.
   */
  modelType: string;

  /**
   * Serving mode of the model, e.g. `'chat'`.
   */
  mode?: string;

  /**
   * Human-readable model name.
   */
  displayName?: string;

  /**
   * Model description.
   */
  description?: string;

  /**
   * Maximum number of input tokens supported by the model.
   */
  maxInputTokens?: number;

  /**
   * Whether the model is in preview.
   */
  isPreview?: boolean;

  /**
   * Model that supersedes this model, if it is deprecated.
   */
  supersededBy?: string;

  supportsFunctionCalling?: boolean;
  supportsResponseSchema?: boolean;
  supportsReasoning?: boolean;
  supportsVision?: boolean;
  supportsAudioInput?: boolean;
  supportsAudioOutput?: boolean;

  /**
   * Supported reasoning effort levels, if any.
   */
  reasoningEfforts?: string[];

  /**
   * Pricing in USD per 1M tokens.
   */
  pricing?: {
    inputPer1MTokens?: number;
    outputPer1MTokens?: number;
    cacheReadPer1MTokens?: number;
  };

  /**
   * Total number of model parameters, e.g. `'753.3B'`.
   */
  parametersCount?: string;

  /**
   * Numerical precision of the model weights, e.g. `'FP8'`.
   */
  precision?: string;
}

const nebulModelInfoSchema = z.object({
  key: z.string().nullish(),
  model_type: z.string(),
  mode: z.string().nullish(),
  display_name: z.string().nullish(),
  description: z.string().nullish(),
  max_input_tokens: z.number().nullish(),
  is_preview: z.boolean().nullish(),
  superseded_by_model_name: z.string().nullish(),
  supports_function_calling: z.boolean().nullish(),
  supports_response_schema: z.boolean().nullish(),
  supports_reasoning: z.boolean().nullish(),
  supports_vision: z.boolean().nullish(),
  supports_audio_input: z.boolean().nullish(),
  supports_audio_output: z.boolean().nullish(),
  reasoning_efforts: z.array(z.string()).nullish(),
  input_cost_per_1m_tokens: z.number().nullish(),
  output_cost_per_1m_tokens: z.number().nullish(),
  cache_read_input_cost_per_1m_tokens: z.number().nullish(),
  parameters_count: z.union([z.string(), z.number()]).nullish(),
  precision: z.string().nullish(),
});

type RawNebulModelInfo = z.infer<typeof nebulModelInfoSchema>;

function toNebulModelInfo(
  model: RawNebulModelInfo,
  modelName: string,
): NebulModelInfo {
  const pricing = {
    ...(model.input_cost_per_1m_tokens != null && {
      inputPer1MTokens: model.input_cost_per_1m_tokens,
    }),
    ...(model.output_cost_per_1m_tokens != null && {
      outputPer1MTokens: model.output_cost_per_1m_tokens,
    }),
    ...(model.cache_read_input_cost_per_1m_tokens != null && {
      cacheReadPer1MTokens: model.cache_read_input_cost_per_1m_tokens,
    }),
  };

  return {
    id: model.key ?? modelName,
    modelType: model.model_type,
    ...(model.mode != null && { mode: model.mode }),
    ...(model.display_name != null && { displayName: model.display_name }),
    ...(model.description != null && { description: model.description }),
    ...(model.max_input_tokens != null && {
      maxInputTokens: model.max_input_tokens,
    }),
    ...(model.is_preview != null && { isPreview: model.is_preview }),
    ...(model.superseded_by_model_name != null && {
      supersededBy: model.superseded_by_model_name,
    }),
    ...(model.supports_function_calling != null && {
      supportsFunctionCalling: model.supports_function_calling,
    }),
    ...(model.supports_response_schema != null && {
      supportsResponseSchema: model.supports_response_schema,
    }),
    ...(model.supports_reasoning != null && {
      supportsReasoning: model.supports_reasoning,
    }),
    ...(model.supports_vision != null && {
      supportsVision: model.supports_vision,
    }),
    ...(model.supports_audio_input != null && {
      supportsAudioInput: model.supports_audio_input,
    }),
    ...(model.supports_audio_output != null && {
      supportsAudioOutput: model.supports_audio_output,
    }),
    ...(model.reasoning_efforts != null && {
      reasoningEfforts: model.reasoning_efforts,
    }),
    ...(Object.keys(pricing).length > 0 && { pricing }),
    ...(model.parameters_count != null && {
      parametersCount: String(model.parameters_count),
    }),
    ...(model.precision != null && { precision: model.precision }),
  };
}

export const nebulModelInfoResponseSchema = z.object({
  data: z.array(
    z
      .object({
        model_info: nebulModelInfoSchema,
        model_name: z.string(),
      })
      .transform(({ model_info, model_name }) =>
        toNebulModelInfo(model_info, model_name),
      ),
  ),
});

/**
 * The model info endpoint returns FastAPI-style errors with a `detail` key,
 * unlike the OpenAI-style `{ error: { message } }` shape of the model APIs.
 */
export const nebulModelInfoFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: z.any(),
    errorToMessage: data =>
      (typeof data?.detail === 'string'
        ? data.detail
        : typeof data?.detail?.message === 'string'
          ? data.detail.message
          : undefined) ??
      getErrorMessage(data) ??
      'unknown error',
  });
