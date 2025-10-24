export type AI302ImageModelId =
  | 'flux-v1.1-ultra'
  | 'flux-pro-v1.1'
  | 'flux-pro'
  | 'flux-dev'
  | 'flux-schnell'
  | 'flux-1-krea'
  | 'flux-kontext-max'
  | 'flux-kontext-pro'
  | 'ideogram/V_1'
  | 'ideogram/V_1_TURBO'
  | 'ideogram/V_2'
  | 'ideogram/V_2_TURBO'
  | 'ideogram/V_2A'
  | 'ideogram/V_2A_TURBO'
  | 'dall-e-3'
  | 'recraftv3'
  | 'recraftv2'
  | 'sdxl-lightning'
  | 'sdxl-lightning-v2'
  | 'sdxl-lightning-v3'
  | 'kolors'
  | 'aura-flow'
  | 'photon-1'
  | 'photon-flash-1'
  | 'sdxl'
  | 'sd3-ultra'
  | 'sd3v2'
  | 'sd3.5-large'
  | 'sd3.5-large-turbo'
  | 'sd3.5-medium'
  | 'midjourney/6.0'
  | 'midjourney/6.1'
  | 'midjourney/7.0'
  | 'nijijourney/6.0'
  | 'google-imagen-3'
  | 'google-imagen-3-fast'
  | 'google-imagen-4-preview'
  | 'doubao-general-v2.1-l'
  | 'doubao-general-v2.0-l'
  | 'doubao-general-v2.0'
  | 'doubao-general-v3.0'
  | 'doubao-seedream-3-0-t2i-250415'
  | 'doubao-seedream-4-0-250828'
  | 'lumina-image-v2'
  | 'omnigen-v1'
  | 'playground-v25'
  | 'cogview-4'
  | 'cogview-4-250304'
  | 'minimaxi-image-01'
  | 'irag-1.0'
  | 'hidream-i1-full'
  | 'hidream-i1-dev'
  | 'hidream-i1-fast'
  | 'gpt-image-1'
  | 'bagel'
  | 'soul'
  | 'kling-v1'
  | 'kling-v1-5'
  | 'kling-v2'
  | 'kling-v2-1'
  | 'qwen-image'
  | 'gemini-2.5-flash-image-preview'
  | (string & {});

export interface AI302ImageSettings {}

interface AI302ImageModelBackendConfig {
  supportsSize?: boolean;
}

export const modelToBackendConfig: Partial<
  Record<AI302ImageModelId, AI302ImageModelBackendConfig>
> = {
  'flux-v1.1-ultra': {
    supportsSize: false,
  },
  'flux-pro-v1.1': {
    supportsSize: true,
  },
  'flux-pro': {
    supportsSize: true,
  },
  'flux-dev': {
    supportsSize: true,
  },
  'flux-schnell': {
    supportsSize: true,
  },
  'flux-1-krea': {
    supportsSize: true,
  },
  'flux-kontext-max': {
    supportsSize: true,
  },
  'flux-kontext-pro': {
    supportsSize: true,
  },
  'ideogram/V_1': {
    supportsSize: true,
  },
  'ideogram/V_1_TURBO': {
    supportsSize: true,
  },
  'ideogram/V_2': {
    supportsSize: true,
  },
  'ideogram/V_2_TURBO': {
    supportsSize: true,
  },
  'ideogram/V_2A': {
    supportsSize: true,
  },
  'ideogram/V_2A_TURBO': {
    supportsSize: true,
  },
  'dall-e-3': {
    supportsSize: true,
  },
  recraftv3: {
    supportsSize: true,
  },
  recraftv2: {
    supportsSize: true,
  },
  'sdxl-lightning': {
    supportsSize: true,
  },
  'sdxl-lightning-v2': {
    supportsSize: true,
  },
  'sdxl-lightning-v3': {
    supportsSize: true,
  },
  kolors: {
    supportsSize: true,
  },
  'aura-flow': {
    supportsSize: true,
  },
  'luma-photon': {
    supportsSize: true,
  },
  sdxl: {
    supportsSize: true,
  },
  'sd3-ultra': {
    supportsSize: false,
  },
  sd3v2: {
    supportsSize: true,
  },
  'sd3.5-large': {
    supportsSize: true,
  },
  'sd3.5-large-turbo': {
    supportsSize: true,
  },
  'sd3.5-medium': {
    supportsSize: true,
  },
  'midjourney/6.0': {
    supportsSize: false,
  },
  'midjourney/6.1': {
    supportsSize: false,
  },
  'midjourney/7.0': {
    supportsSize: false,
  },
  'nijijourney/6.0': {
    supportsSize: false,
  },
  'google-imagen-3': {
    supportsSize: true,
  },
  'google-imagen-3-fast': {
    supportsSize: true,
  },
  'google-imagen-4-preview': {
    supportsSize: false,
  },
  'doubao-general-v2.1-l': {
    supportsSize: true,
  },
  'doubao-general-v2.0-l': {
    supportsSize: true,
  },
  'doubao-general-v2.0': {
    supportsSize: true,
  },
  'doubao-general-v3.0': {
    supportsSize: true,
  },
  'doubao-seedream-3-0-t2i-250415': {
    supportsSize: true,
  },
  'doubao-seedream-4-0-250828': {
    supportsSize: true,
  },
  'lumina-image-v2': {
    supportsSize: true,
  },
  'omnigen-v1': {
    supportsSize: true,
  },
  'playground-v25': {
    supportsSize: true,
  },
  'cogview-4': {
    supportsSize: true,
  },
  'cogview-4-250304': {
    supportsSize: true,
  },
  'minimaxi-image-01': {
    supportsSize: false,
  },
  'irag-1.0': {
    supportsSize: false,
  },
  'hidream-i1-full': {
    supportsSize: true,
  },
  'hidream-i1-dev': {
    supportsSize: true,
  },
  'hidream-i1-fast': {
    supportsSize: true,
  },
  'gpt-image-1': {
    supportsSize: true,
  },
  bagel: {
    supportsSize: false,
  },
  soul: {
    supportsSize: true,
  },
  'kling-v1': {
    supportsSize: true,
  },
  'kling-v1-5': {
    supportsSize: true,
  },
  'kling-v2': {
    supportsSize: true,
  },
  'kling-v2-1': {
    supportsSize: true,
  },
  'qwen-image': {
    supportsSize: false,
  },
  'gemini-2.5-flash-image-preview': {
    supportsSize: false,
  },
};
