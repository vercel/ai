import {
  useChat as useChatSvelte,
  useCompletion as useCompletionSvelte,
  useAssistant as useAssistantSvelte,
} from '@ai-sdk/svelte';

/**
 * @deprecated Use `useChat` from `@ai-sdk/svelte` instead.
 */
export const useChat = useChatSvelte;

/**
 * @deprecated Use `useCompletion` from `@ai-sdk/svelte` instead.
 */
export const useCompletion = useCompletionSvelte;

/**
 * @deprecated Use `useAssistant` from `@ai-sdk/svelte` instead.
 */
export const useAssistant = useAssistantSvelte;
