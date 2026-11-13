import type { GoogleVertexModelIds } from './google-vertex-model-catalog';

export type GoogleVertexVideoModelId =
  | GoogleVertexModelIds['video']
  | (string & {});
