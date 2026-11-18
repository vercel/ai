/**
 * Default base URL of the Inference Cooperative gateway. Kept serializable so
 * model configs survive workflow serialization (the `url` function is
 * dropped by `serializeModelOptions`).
 */
export const INFERENCE_COOP_DEFAULT_BASE_URL =
  'https://gateway.inference.coop/v1';
