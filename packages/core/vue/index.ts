import {
  useChat as useChatVue,
  useCompletion as useCompletionVue,
  useAssistant as useAssistantVue,
} from '@ai-sdk/vue';

/**
 * @deprecated Use `useChat` from `@ai-sdk/vue` instead.
 */
export const useChat = useChatVue;

/**
 * @deprecated Use `useCompletion` from `@ai-sdk/vue` instead.
 */
export const useCompletion = useCompletionVue;

/**
 * @deprecated Use `useAssistant` from `@ai-sdk/vue` instead.
 */
export const useAssistant = useAssistantVue;

/**
 * @deprecated Use `@ai-sdk/vue` instead.
 */
export type {
  CreateMessage,
  Message,
  UseChatOptions,
  UseChatHelpers,
  UseAssistantHelpers,
} from '@ai-sdk/vue';
