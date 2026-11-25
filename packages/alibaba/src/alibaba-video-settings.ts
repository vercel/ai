import type { AlibabaModelIds } from './alibaba-model-catalog';

// https://www.alibabacloud.com/help/en/model-studio/use-video-generation
export type AlibabaVideoModelId = AlibabaModelIds['video'] | (string & {});
