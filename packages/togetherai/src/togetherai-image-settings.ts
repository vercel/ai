// https://api.together.ai/models
export type TogetherAIImageModelId =
  | 'stabilityai/stable-diffusion-xl-base-1.0'
  | 'black-forest-labs/FLUX.1-dev'
  | 'black-forest-labs/FLUX.1-dev-lora'
  | 'black-forest-labs/FLUX.1-schnell'
  | 'black-forest-labs/FLUX.1-canny'
  | 'black-forest-labs/FLUX.1-depth'
  | 'black-forest-labs/FLUX.1-redux'
  | 'black-forest-labs/FLUX.1.1-pro'
  | 'black-forest-labs/FLUX.1-pro'
  | 'black-forest-labs/FLUX.1-schnell-Free'
  | (string & {});
