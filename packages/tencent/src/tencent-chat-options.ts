import type { TencentModelIds } from './tencent-model-catalog';
// Catalog: https://www.tencentcloud.com/document/product/1300/78934
export type TencentChatModelId = TencentModelIds['language'] | (string & {});
