import {
  useChat as useChatReact,
  useCompletion as useCompletionReact,
  useAssistant as useAssistantReact,
  experimental_useObject as experimental_useObjectReact,
} from '@ai-sdk/react';

/**
 * @deprecated Use `@ai-sdk/react` instead.
 */
export const useChat = useChatReact;

/**
 * @deprecated Use `@ai-sdk/react` instead.
 */
export const useCompletion = useCompletionReact;

/**
 * @deprecated Use `@ai-sdk/react` instead.
 */
export const useAssistant = useAssistantReact;

/**
 * @deprecated Use `@ai-sdk/react` instead.
 */
export const experimental_useObject = experimental_useObjectReact;

export type {
  /**
   * @deprecated Use `@ai-sdk/react` instead.
   */
  CreateMessage,

  /**
   * @deprecated Use `@ai-sdk/react` instead.
   */
  Message,

  /**
   * @deprecated Use `@ai-sdk/react` instead.
   */
  UseChatOptions,

  /**
   * @deprecated Use `@ai-sdk/react` instead.
   */
  UseChatHelpers,
} from '@ai-sdk/react';
