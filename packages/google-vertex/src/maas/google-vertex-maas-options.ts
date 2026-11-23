import type { GoogleVertexModelIds } from '../google-vertex-model-catalog';

// https://cloud.google.com/vertex-ai/generative-ai/docs/maas/use-open-models
export type GoogleVertexMaasModelId =
  | GoogleVertexModelIds['maas']
  | (string & {});
