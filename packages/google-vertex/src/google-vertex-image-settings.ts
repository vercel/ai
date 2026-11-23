import type { GoogleVertexModelIds } from './google-vertex-model-catalog';

export type GoogleVertexImageModelId =
  | GoogleVertexModelIds['image']
  | (string & {});
