import {
  useChat as useChatSolid,
  useCompletion as useCompletionSolid,
} from '@ai-sdk/solid';

/**
 * @deprecated Use `useChat` from `@ai-sdk/solid` instead.
 */
export const useChat = useChatSolid;

/**
 * @deprecated Use `useCompletion` from `@ai-sdk/solid` instead.
 */
export const useCompletion = useCompletionSolid;

/**
 * @deprecated Use `@ai-sdk/solid` instead.
 */
export type {
  CreateMessage,
  Message,
  UseChatOptions,
  UseChatHelpers,
} from '@ai-sdk/solid';
