import {
  useChat as useChatReact,
  useCompletion as useCompletionReact,
  useAssistant as useAssistantReact,
} from '@ai-sdk/react';

/**
 * @deprecated Use `useChat` from `@ai-sdk/react` instead.
 */
export const useChat = useChatReact;

/**
 * @deprecated Use `useCompletion` from `@ai-sdk/react` instead.
 */
export const useCompletion = useCompletionReact;

/**
 * @deprecated Use `useAssistant` from `@ai-sdk/react` instead.
 */
export const useAssistant = useAssistantReact;

/**
 * @deprecated Use `@ai-sdk/react` instead.
 */
export type {
  CreateMessage,
  Message,
  UseChatOptions,
  UseChatHelpers,
} from '@ai-sdk/react';
