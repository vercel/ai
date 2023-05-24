import { useCallback, useId, useRef, useEffect } from "react";
import useSWRMutation from "swr/mutation";
import useSWR from "swr";

import { type AIStreamCallbacks } from "./ai-stream";

export type Message = {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
  content: string;
  role: string;
  chatId?: string;
};

export function useChat({
  initialMessages = [],
  parser,
  id,
  api,
}: {
  initialMessages: Message[];
  parser: (res: Response, cb?: AIStreamCallbacks) => ReadableStream;
  id?: string;
  api: string;
}) {
  const hookId = useId();
  const resourceId = id || hookId;

  const { data, mutate } = useSWR<Message[]>([api, resourceId], null, {
    fallbackData: initialMessages,
  });

  const messagesRef = useRef<Message[]>(data);
  useEffect(() => {
    messagesRef.current = data;
  }, [data]);

  const { error, trigger, isMutating } = useSWRMutation<
    null,
    any,
    any,
    Message[]
  >(
    [api, resourceId],
    async (_, { arg: messagesSnapshot }) => {
      const res = await fetch(api, {
        method: "POST",
        body: JSON.stringify({
          messages: messagesSnapshot,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to fetch");
      }

      let result = "";
      let resolve;
      const promise = new Promise((r) => (resolve = r));

      parser(res, {
        onToken: async (token) => {
          result += token;
          mutate(
            [
              ...messagesSnapshot,
              {
                id: `${Date.now()}`,
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
      });

      await promise;
      return null;
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

  // TODO: implement reload last message
  // const reload = useCallback(() => {
  //   trigger(messagesRef.current)
  // }, [])

  return {
    messages: data,
    error,
    append,
    // reload,
    isLoading: isMutating,
  };
}
