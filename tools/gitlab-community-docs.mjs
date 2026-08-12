// @gitlab/gitlab-ai-provider@4.1.0 MODEL_MAPPINGS. `duo-chat` is not a key.
export const GITLAB_4_1_0_CHAT_MODEL_IDS = new Set([
  'duo-chat-opus-4-6',
  'duo-chat-sonnet-4-6',
  'duo-chat-opus-4-5',
  'duo-chat-sonnet-4-5',
  'duo-chat-haiku-4-5',
  'duo-chat-gpt-5-1',
  'duo-chat-gpt-5-2',
  'duo-chat-gpt-5-mini',
  'duo-chat-gpt-5-codex',
  'duo-chat-gpt-5-2-codex',
  'duo-chat-gpt-5-3-codex',
]);

export const GITLAB_4_1_0_WORKFLOW_MODEL_IDS = new Set([
  'duo-workflow',
  'duo-workflow-default',
  'duo-workflow-sonnet-4-5',
  'duo-workflow-sonnet-4-6',
  'duo-workflow-opus-4-5',
  'duo-workflow-haiku-4-5',
  'duo-workflow-opus-4-6',
]);

const FACTORY_CALL =
  /gitlab(?:\.(?:chat|languageModel|agenticChat|workflowChat))?\(\s*['"]([^'"]+)['"]/g;

export function extractGitLabFactoryModelIds(source) {
  return [...source.matchAll(FACTORY_CALL)].map(match => match[1]);
}

export function findUnregisteredGitLabDocModelIds(source) {
  return extractGitLabFactoryModelIds(source).filter(
    id =>
      !GITLAB_4_1_0_CHAT_MODEL_IDS.has(id) &&
      !GITLAB_4_1_0_WORKFLOW_MODEL_IDS.has(id),
  );
}

export function treatsDuoChatAsDefaultModel(source) {
  return /default [`']duo-chat[`']/i.test(source);
}
