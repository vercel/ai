// https://aimlapi.com/models
export type AIMLAPIImageModelId =
  'dall-e-2' |
  'dall-e-3' |
  'flux-pro' |
  'flux-pro/v1.1' |
  'flux-pro/v1.1-ultra' |
  'flux-realism' |
  'google/imagen4/preview' |
  'imagen-3.0-generate-002' |
  'recraft-v3' |
  'stable-diffusion-v3-medium' |
  'stable-diffusion-v35-large' |
  'triposr'
  | (string & {});


export interface AimlapiImageSettings {
  /**
Override the maximum number of images per call (default 1)
   */
  maxImagesPerCall?: number;
}
