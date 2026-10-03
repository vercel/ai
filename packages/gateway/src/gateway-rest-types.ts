/** Types for raw AI Gateway REST API responses. */
export interface GatewayRestModelsResponse {
  /** Always `"list"` for model-list responses. */
  object: 'list';
  /** Available AI Gateway models. */
  data: GatewayRestModel[];
}

/** Parameters for the AI Gateway `GET /v1/models/{creator}/{model}/endpoints` REST endpoint. */
export interface GatewayRestModelEndpointsParams {
  /** Model creator, such as `openai`. */
  creator: string;
  /** Model name, without its creator prefix. */
  model: string;
}

/**
 * The response returned by the AI Gateway
 * `GET /v1/models/{creator}/{model}/endpoints` REST endpoint.
 */
export interface GatewayRestModelEndpointsResponse {
  /** The requested model and its available provider endpoints. */
  data: GatewayRestModelEndpoints;
}

/** A model and the provider endpoints through which AI Gateway serves it. */
export interface GatewayRestModelEndpoints {
  /** Model identifier, for example `openai/gpt-5`. */
  id: string;
  /** Human-readable model name. */
  name: string;
  /** Unix timestamp for when the model was added to AI Gateway. */
  created: number;
  /** Unix timestamp for when the model was released, when available. */
  released?: number;
  /** Model description. */
  description: string;
  /** Model architecture and modality metadata. */
  architecture: GatewayRestModelArchitecture;
  /** Provider endpoints that can serve the model. */
  endpoints: GatewayRestModelEndpoint[];

  /** Additional service-owned metadata. */
  [key: string]: unknown;
}

/** Architecture metadata for a Gateway REST model. */
export interface GatewayRestModelArchitecture {
  tokenizer?: string | null;
  instruct_type?: string | null;
  modality?: string;
  input_modalities?: string[];
  output_modalities?: string[];

  /** Additional service-owned architecture metadata. */
  [key: string]: unknown;
}

/** A provider endpoint that can serve a Gateway REST model. */
export interface GatewayRestModelEndpoint {
  name: string;
  model_name: string;
  provider_name: string;
  context_length?: number;
  max_completion_tokens?: number;
  max_prompt_tokens?: number;
  pricing: GatewayRestModelEndpointPricing;
  supported_parameters?: string[];
  status?: number;
  uptime_last_15m?: number;
  uptime_last_1h?: number;
  uptime_last_1d?: number;
  throughput_last_1h?: GatewayRestModelEndpointMetric;
  latency_last_1h?: GatewayRestModelEndpointMetric;
  supports_implicit_caching?: boolean;
  tags?: string[];
  quantization?: string | null;
  has_no_training?: boolean;

  /** Additional service-owned endpoint metadata. */
  [key: string]: unknown;
}

/** Pricing metadata for a Gateway REST model endpoint. */
export interface GatewayRestModelEndpointPricing {
  prompt?: string;
  completion?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  image?: string;
  web_search?: string;

  /** Additional pricing fields that vary by model type and provider. */
  [key: string]: unknown;
}

/** Percentile metrics reported for a Gateway REST model endpoint. */
export interface GatewayRestModelEndpointMetric {
  p50: number;
  p95: number;
}

/**
 * A model returned by the AI Gateway `GET /v1/models` REST endpoint.
 */
export interface GatewayRestModel {
  /** Model identifier, for example `openai/gpt-5`. */
  id: string;
  /** Always `"model"` for model entries. */
  object: 'model';
  /** Unix timestamp for when the model was added to AI Gateway. */
  created: number;
  /** Unix timestamp for when the model was released, when available. */
  released?: number;
  /** Model provider or owner. */
  owned_by: string;
  /** Human-readable model name. */
  name: string;
  /** Model description. */
  description: string;
  /** Maximum context length in tokens, when applicable. */
  context_window?: number;
  /** Maximum output tokens, when applicable. */
  max_tokens?: number;
  /** Model modality. */
  type: string;
  /** Capability tags, when available. */
  tags?: string[];
  /** Broad parameter support, when available. */
  supported_parameters?: string[];
  /** Known reasoning controls, when available. */
  reasoning_options?: GatewayRestModelReasoningOption[];
  /** Pricing information. Its available fields vary by model type. */
  pricing: GatewayRestModelPricing;

  /**
   * Additional service-owned metadata. The Gateway model catalog can add
   * fields independently of SDK releases.
   */
  [key: string]: unknown;
}

/** A reasoning control supported by a Gateway REST model. */
export interface GatewayRestModelReasoningOption {
  /** The control kind, such as `effort`, `budget_tokens`, or `toggle`. */
  type: string;
  /** Allowed values for an `effort` control. */
  values?: string[];
  /** Minimum thinking-token budget for a `budget_tokens` control. */
  min?: number;
  /** Maximum thinking-token budget for a `budget_tokens` control. */
  max?: number;

  /** Additional service-owned control metadata. */
  [key: string]: unknown;
}

/** Pricing information for a Gateway REST model. */
export interface GatewayRestModelPricing {
  /** Base cost per input token. */
  input?: string;
  /** Tiered input-token pricing. */
  input_tiers?: GatewayRestModelPricingTier[];
  /** Base cost per output token. */
  output?: string;
  /** Tiered output-token pricing. */
  output_tiers?: GatewayRestModelPricingTier[];
  /** Cost per cached input token read. */
  input_cache_read?: string;
  /** Tiered cached-input-read pricing. */
  input_cache_read_tiers?: GatewayRestModelPricingTier[];
  /** Cost per input token written to cache. */
  input_cache_write?: string;
  /** Tiered cached-input-write pricing. */
  input_cache_write_tiers?: GatewayRestModelPricingTier[];
  /** Cost per generated image. */
  image?: string;
  /** Cost per web search request. */
  web_search?: string;

  /** Additional pricing fields that vary by model type. */
  [key: string]: unknown;
}

/** A tier in Gateway REST model pricing. */
export interface GatewayRestModelPricingTier {
  /** Cost per token in this tier. */
  cost: string;
  /** Minimum token count, inclusive. */
  min: number;
  /** Maximum token count, exclusive. Omitted for the highest tier. */
  max?: number;
}
