import type { GoogleVertexModelIds } from '../google-vertex-model-catalog';

// https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/grok
export type GoogleVertexXaiModelId =
  | GoogleVertexModelIds['xai']
  | (string & {});
