import type { SubquadraticModelIds } from './subquadratic-model-catalog';

// Models: https://docs.subq.ai/endpoints/chat-completions-api/
export type SubquadraticChatModelId =
  | SubquadraticModelIds['language']
  | (string & {});

/**
 * SubQ accepts the OpenAI-compatible chat options. Keys under
 * `providerOptions.subquadratic` that are not part of that set are forwarded to
 * the request body unchanged.
 */
export type SubquadraticLanguageModelChatOptions = Record<string, never>;
