// https://docs.z.ai/guides/llm
// Below is the current list of Z.AI language models.
// Other models hosted on the platform are also supported, but not listed here.
export type ZaiChatModelId =
  // GLM-5 series (flagship reasoning + turbo)
  | 'glm-5.2'
  | 'glm-5.1'
  | 'glm-5'
  | 'glm-5-turbo'
  // GLM-4.x series
  | 'glm-4.7'
  | 'glm-4.6'
  | 'glm-4.5'
  | (string & {});
