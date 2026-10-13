/**
 * Z.AI chat model ids from the official OpenAPI 1.0.0 specification,
 * retrieved from https://docs.z.ai/openapi.json on 2026-08-26.
 */
export type ZaiChatModelId =
  | 'glm-5.3'
  | 'glm-5.2'
  | 'glm-5.1'
  | 'glm-5-turbo'
  | 'glm-5'
  | 'glm-4.7'
  | 'glm-4.7-flash'
  | 'glm-4.7-flashx'
  | 'glm-4.6'
  | 'glm-4.5'
  | 'glm-4.5-air'
  | 'glm-4.5-x'
  | 'glm-4.5-airx'
  | 'glm-4.5-flash'
  | 'glm-4-32b-0414-128k'
  | 'glm-5.3-flash'
  | 'glm-5v-turbo'
  | 'glm-4.6v'
  | 'glm-4.6v-flash'
  | 'glm-4.6v-flashx'
  | 'glm-4.5v'
  | 'autoglm-phone-multilingual'
  | (string & {});
