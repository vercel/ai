import type { FalModelIds } from './fal-model-catalog';

// https://fal.ai/explore/search?categories=image-to-image,text-to-image&q=newest
export type FalImageModelId = FalModelIds['image'] | (string & {});

export type FalImageSize =
  | 'square'
  | 'square_hd'
  | 'landscape_16_9'
  | 'landscape_4_3'
  | 'portrait_16_9'
  | 'portrait_4_3'
  | {
      width: number;
      height: number;
    };
