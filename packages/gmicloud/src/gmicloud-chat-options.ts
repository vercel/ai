import type { GmicloudModelIds } from './gmicloud-model-catalog';

// Catalog: GET https://api.gmi-serving.com/v1/models
export type GmicloudChatModelId = GmicloudModelIds['language'] | (string & {});
