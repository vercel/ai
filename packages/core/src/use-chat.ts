import { useCallback, useId, useRef, useEffect, useState } from "react";
import useSWRMutation from "swr/mutation";
import useSWR from "swr";
import { customAlphabet } from "nanoid";

import type { AnthropicStream } from "./anthropic-stream";
import type { HuggingFaceStream } from "./huggingface-stream";
import type { OpenAIStream } from "./openai-stream";
import type { AIStreamCallbacks } from "./ai-stream";

// 7-character random string
const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  7
);

export type Message = {
  id: string;
  createdAt?: Date;
  content: string;
  role: "system" | "user" | "assistant";
};

export function useChat({
  api,
  StreamProvider,
  id,
  initialMessages = [],
}: {
  /**
   * The API endpoint that accepts a `{ messages: Message[] }` object and returns
   * a stream of tokens of the AI chat response.
   */
  api: string;
  /**
   * The AI stream provider function that accepts a Response and the callbacks,
   * and returns a ReadableStream.
   * It can be AnthropicStream, HuggingFaceStream, or OpenAIStream.
   */
  StreamProvider:
    | typeof AnthropicStream
    | typeof HuggingFaceStream
    | typeof OpenAIStream;
  /**
   * An unique identifier for the chat. If not provided, a random one will be
   * generated. When provided, the `useChat` hook with the same `id` will
   * have shared states across components.
   */
  id?: string;
  /**
   * Initial messages of the chat. Useful to load an existing chat history.
   */
  initialMessages?: Message[];
}) {
  // Generate an unique id for the chat if not provided.
  const hookId = useId();
  const chatId = id || hookId;

  // Store the chat state in SWR, using the chatId as the key to share states.
  const { data, mutate } = useSWR<Message[]>([api, chatId], null, {
    fallbackData: initialMessages,
  });
  const messages = data!;

  // Keep the latest messages in a ref.
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Abort controller to cancel the current API call.
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  // Actual mutation hook to send messages to the API endpoint and update the
  // chat state.
  const { error, trigger, isMutating } = useSWRMutation<
    null,
    any,
    [string, string],
    Message[]
  >(
    [api, chatId],
    async (_, { arg: messagesSnapshot }) => {
      try {
        const abortController = new AbortController();
        setAbortController(abortController);

        // Do an optimistic update to the chat state to show the updated messages
        // immediately.
        const previousMessages = messagesRef.current;
        mutate(messagesSnapshot, false);

        const res = await fetch(api, {
          method: "POST",
          body: JSON.stringify({
            messages: messagesSnapshot,
          }),
          signal: abortController.signal,
        }).catch((err) => {
          // Restore the previous messages if the request fails.
          mutate(previousMessages, false);
          throw err;
        });
        if (!res.ok) {
          // Restore the previous messages if the request fails.
          mutate(previousMessages, false);
          throw new Error("Failed to fetch the chat response.");
        }
        if (!res.body) {
          throw new Error("The response body is empty.");
        }

        let result = "";
        let resolve: () => void;
        const promise = new Promise<void>((r) => (resolve = r));

        if (!("$$typeof" in StreamProvider)) {
          throw new Error(
            "Invalid stream provider: it must be one of AnthropicStream, HuggingFaceStream, or OpenAIStream."
          );
        }

        const createdAt = new Date();
        const replyId = nanoid();
        const callback: AIStreamCallbacks = {
          onToken: async (token) => {
            // Update the chat state with the new message tokens.
            result += token;
            mutate(
              [
                ...messagesSnapshot,
                {
                  id: replyId,
                  createdAt,
                  content: result,
                  role: "assistant",
                },
              ],
              false
            );
          },
          async onCompletion() {
            resolve();
          },
        };

        if (
          (StreamProvider as any).$$typeof ===
          Symbol.for("AIStream.HuggingFaceStream")
        ) {
          // HuggingFaceStream accepts an async generator
          const reader = res.body.getReader();
          const generator = async function* () {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              yield value;
            }
          };
          const HuggingFaceStreamProvider =
            StreamProvider as typeof HuggingFaceStream;
          HuggingFaceStreamProvider(generator(), callback);
        } else {
          const CommonStreamProvider = StreamProvider as
            | typeof AnthropicStream
            | typeof OpenAIStream;
          CommonStreamProvider(res, callback);
        }

        await promise;

        setAbortController(null);
        return null;
      } catch (err) {
        // Ignore abort errors as they are expected.
        if ((err as any).name === "AbortError") {
          setAbortController(null);
          return null;
        }

        throw err;
      }
    },
    {
      populateCache: false,
      revalidate: false,
    }
  );

  /**
   * Append a user message to the chat list, and trigger the API call to fetch
   * the assistant's response.
   */
  const append = useCallback((message: Message) => {
    trigger(messagesRef.current.concat(message));
  }, []);

  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, this method will do nothing.
   */
  const reload = useCallback(() => {
    if (messagesRef.current.length === 0) return;

    if (
      messagesRef.current[messagesRef.current.length - 1].role !== "assistant"
    )
      return;

    trigger(messagesRef.current.slice(0, -1));
  }, []);

  /**
   * Abort the current API request but keep the generated tokens.
   */
  const stop = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  }, [abortController]);

  /**
   * Update the `messages` state locally. This is useful when you want to
   * edit the messages on the client, and then trigger the `reload` method
   * to regenerate the AI response.
   */
  const set = useCallback((messages: Message[]) => {
    mutate(messages, false);
    messagesRef.current = messages;
  }, []);

  return {
    messages,
    error,
    append,
    reload,
    stop,
    set,
    isLoading: isMutating,
  };
}
