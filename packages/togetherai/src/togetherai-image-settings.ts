// https://api.together.ai/models
export type TogetherAIImageModelId =
  // Google
  | 'google/gemini-3-pro-image'
  | 'google/flash-image-2.5'
  | 'google/flash-image-3.1'
  | 'google/imagen-4.0-ultra'
  | 'google/imagen-4.0-preview'
  | 'google/imagen-4.0-fast'
  // Black Forest Labs - FLUX.2
  | 'black-forest-labs/FLUX.2-max'
  | 'black-forest-labs/FLUX.2-pro'
  | 'black-forest-labs/FLUX.2-dev'
  | 'black-forest-labs/FLUX.2-flex'
  // Black Forest Labs - FLUX.1
  | 'black-forest-labs/FLUX.1.1-pro'
  | 'black-forest-labs/FLUX.1-schnell'
  | 'black-forest-labs/FLUX.1-krea-dev'
  // Black Forest Labs - FLUX Kontext (image editing)
  | 'black-forest-labs/FLUX.1-kontext-pro'
  | 'black-forest-labs/FLUX.1-kontext-max'
  // OpenAI
  | 'openai/gpt-image-1.5'
  // Qwen
  | 'Qwen/Qwen-Image-2.0-Pro'
  | 'Qwen/Qwen-Image-2.0'
  | 'Qwen/Qwen-Image'
  | (string & {});
