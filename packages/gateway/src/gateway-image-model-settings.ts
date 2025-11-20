export type GatewayImageModelId =
  | 'google/imagen-4.0-generate'
  | 'bfl/flux-kontext-max'
  | 'bfl/flux-kontext-pro'
  | 'bfl/flux-pro-1.0-fill'
  | 'bfl/flux-pro-1.1'
  | 'bfl/flux-pro-1.1-ultra'
  | (string & {});

/**
  Default number of images a provider can return per single request.
  Only include providers that deviate from the default of 4 (e.g. Vertex
  Imagen is 4).
*/
export const DEFAULT_MAX_IMAGES_PER_CALL_BY_PROVIDER: Record<string, number> = {
  bfl: 1,
};

export function getDefaultMaxImagesPerCallForModel(
  modelId: GatewayImageModelId,
): number | undefined {
  const providerPrefix = typeof modelId === 'string' ? modelId.split('/')[0] : '';
  return DEFAULT_MAX_IMAGES_PER_CALL_BY_PROVIDER[providerPrefix];
}
