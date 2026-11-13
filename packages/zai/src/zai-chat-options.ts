import type { ZaiModelIds } from './zai-model-catalog';

/**
 * Z.AI chat model ids from the official OpenAPI 1.0.0 specification,
 * retrieved from https://docs.z.ai/openapi.json on 2026-08-26.
 */
export type ZaiChatModelId = ZaiModelIds['language'] | (string & {});
