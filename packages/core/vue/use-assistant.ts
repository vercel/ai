import { ref, reactive, toRefs, onUnmounted } from 'vue';
import { isAbortError } from '@ai-sdk/provider-utils';
import { generateId } from '../shared/generate-id';
import { readDataStream } from '../shared/read-data-stream';
import {
  AssistantStatus,
  CreateMessage,
  Message,
  UseAssistantOptions,
} from '../shared/types';

export function useAssistant({
  api,
  threadId: threadIdParam,
  credentials,
  headers,
  body,
  onError,
}: UseAssistantOptions) {
  const state = reactive({
    messages: [] as Message[],
    input: '',
    threadId: undefined as string | undefined,
    status: 'awaiting_message' as AssistantStatus,
    error: undefined as unknown,
  });

  const abortControllerRef = ref<AbortController | null>(null);

  const handleInputChange = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    state.input = target.value;
  };

  const stop = () => {
    if (abortControllerRef.value) {
      abortControllerRef.value.abort();
      abortControllerRef.value = null;
    }
  };

  const append = async (
    message: Message | CreateMessage,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => {
    state.status = 'in_progress';

    state.messages.push({
      ...message,
      id: message.id ?? generateId(),
    });

    state.input = '';

    const abortController = new AbortController();

    try {
      abortControllerRef.value = abortController;

      const result = await fetch(api, {
        method: 'POST',
        credentials,
        signal: abortController.signal,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          ...body,
          threadId: threadIdParam ?? state.threadId ?? null,
          message: message.content,
          data: requestOptions?.data,
        }),
      });

      if (result.body == null) {
        throw new Error('The response body is empty.');
      }

      for await (const { type, value } of readDataStream(
        result.body.getReader(),
      )) {
        switch (type) {
          case 'assistant_message': {
            state.messages.push({
              id: value.id,
              role: value.role,
              content: value.content[0].text.value,
            });
            break;
          }

          case 'text': {
            const lastMessage = state.messages[state.messages.length - 1];
            lastMessage.content += value;
            break;
          }

          case 'data_message': {
            state.messages.push({
              id: value.id ?? generateId(),
              role: 'data',
              content: '',
              data: value.data,
            });
            break;
          }

          case 'assistant_control_data': {
            state.threadId = value.threadId;
            const lastMessage = state.messages[state.messages.length - 1];
            lastMessage.id = value.messageId;
            break;
          }

          case 'error': {
            state.error = new Error(value);
            break;
          }
        }
      }
    } catch (error) {
      if (isAbortError(error) && abortController.signal.aborted) {
        abortControllerRef.value = null;
        return;
      }

      if (onError && error instanceof Error) {
        onError(error);
      }

      state.error = error as Error;
    } finally {
      abortControllerRef.value = null;
      state.status = 'awaiting_message';
    }
  };

  const submitMessage = async (
    event?: Event,
    requestOptions?: {
      data?: Record<string, string>;
    },
  ) => {
    event?.preventDefault?.();

    if (state.input === '') {
      return;
    }

    append({ role: 'user', content: state.input }, requestOptions);
  };

  onUnmounted(() => {
    if (abortControllerRef.value) {
      abortControllerRef.value.abort();
    }
  });

  return {
    ...toRefs(state),
    handleInputChange,
    stop,
    append,
    submitMessage,
  };
}
