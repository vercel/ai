import type { BlackForestLabsModelIds } from './black-forest-labs-model-catalog';

export type BlackForestLabsImageModelId =
  | BlackForestLabsModelIds['image']
  | (string & {});

export type BlackForestLabsAspectRatio = `${number}:${number}`;
