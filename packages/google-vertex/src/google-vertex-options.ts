import type { GoogleVertexModelIds } from './google-vertex-model-catalog';

// https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions
// Note preview and experimental models may only be detailed in AI Studio:
// https://console.cloud.google.com/vertex-ai/studio/
export type GoogleVertexModelId =
  | GoogleVertexModelIds['language']
  | (string & {});
