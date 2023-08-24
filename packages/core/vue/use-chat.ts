import swrv from 'swrv'
import { ref, unref } from 'vue'
import type { Ref } from 'vue'

import type {
  Message,
  CreateMessage,
  UseChatOptions,
  RequestOptions
} from '../shared/types'
import { createChunkDecoder, nanoid } from '../shared/utils'

export type { Message, CreateMessage, UseChatOptions }

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Ref<Message[]>
  /** The error object of the API request */
  error: Ref<undefined | Error>
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   */
  append: (
    message: Message | CreateMessage,
    options?: RequestOptions
  ) => Promise<string | null | undefined>
  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, it will request the API to generate a
   * new response.
   */
  reload: (options?: RequestOptions) => Promise<string | null | undefined>
  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop: () => void
  /**
   * Update the `messages` state locally. This is useful when you want to
   * edit the messages on the client, and then trigger the `reload` method
   * manually to regenerate the AI response.
   */
  setMessages: (messages: Message[]) => void
  /** The current value of the input */
  input: Ref<string>
  /** Form submission handler to automattically reset input and append a user message  */
  handleSubmit: (e: any) => void
  /** Whether the API request is in progress */
  isLoading: Ref<boolean | undefined>
}

let uniqueId = 0

// @ts-expect-error - some issues with the default export of useSWRV
const useSWRV = (swrv.default as typeof import('swrv')['default']) || swrv
const store: Record<string, Message[] | undefined> = {}

export function useChat({
  api = '/api/chat',
  id,
  initialMessages = [],
  initialInput = '',
  sendExtraMessageFields,
  onResponse,
  onFinish,
  onError,
  credentials,
  headers,
  body
}: UseChatOptions = {}): UseChatHelpers {
  // Generate a unique ID for the chat if not provided.
  const chatId = id || `chat-${uniqueId++}`

  const key = `${api}|${chatId}`
  const { data, mutate: originalMutate } = useSWRV<Message[]>(
    key,
    () => store[key] || initialMessages
  )

  const { data: isLoading, mutate: mutateLoading } = useSWRV<boolean>(
    `${chatId}-loading`,
    null
  )

  isLoading.value ??= false

  // Force the `data` to be `initialMessages` if it's `undefined`.
  data.value ||= initialMessages

  const mutate = (data?: Message[]) => {
    store[key] = data
    return originalMutate()
  }

  // Because of the `initialData` option, the `data` will never be `undefined`.
  const messages = data as Ref<Message[]>

  const error = ref<undefined | Error>(undefined)

  let abortController: AbortController | null = null
  async function triggerRequest(
    messagesSnapshot: Message[],
    options?: RequestOptions
  ) {
    try {
      mutateLoading(() => true)
      abortController = new AbortController()

      // Do an optimistic update to the chat state to show the updated messages
      // immediately.
      const previousMessages = messages.value
      mutate(messagesSnapshot)

      const res = await fetch(api, {
        method: 'POST',
        body: JSON.stringify({
          messages: sendExtraMessageFields
            ? messagesSnapshot
            : messagesSnapshot.map(({ role, content }) => ({
                role,
                content
              })),
          ...unref(body), // Use unref to unwrap the ref value
          ...options?.body
        }),
        headers: {
          ...headers,
          ...options?.headers
        },
        signal: abortController.signal,
        credentials
      }).catch(err => {
        // Restore the previous messages if the request fails.
        mutate(previousMessages)
        throw err
      })

      if (onResponse) {
        try {
          await onResponse(res)
        } catch (err) {
          throw err
        }
      }

      if (!res.ok) {
        // Restore the previous messages if the request fails.
        mutate(previousMessages)
        throw new Error(
          (await res.text()) || 'Failed to fetch the chat response.'
        )
      }
      if (!res.body) {
        throw new Error('The response body is empty.')
      }

      let result = ''
      const createdAt = new Date()
      const replyId = nanoid()
      const reader = res.body.getReader()
      const decoder = createChunkDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        // Update the chat state with the new message tokens.
        result += decoder(value)
        mutate([
          ...messagesSnapshot,
          {
            id: replyId,
            createdAt,
            content: result,
            role: 'assistant'
          }
        ])

        // The request has been aborted, stop reading the stream.
        if (abortController === null) {
          reader.cancel()
          break
        }
      }

      if (onFinish) {
        onFinish({
          id: replyId,
          createdAt,
          content: result,
          role: 'assistant'
        })
      }

      abortController = null
      return result
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        abortController = null
        return null
      }

      if (onError && err instanceof Error) {
        onError(err)
      }

      error.value = err as Error
    } finally {
      mutateLoading(() => false)
    }
  }

  const append: UseChatHelpers['append'] = async (message, options) => {
    if (!message.id) {
      message.id = nanoid()
    }
    return triggerRequest(messages.value.concat(message as Message), options)
  }

  const reload: UseChatHelpers['reload'] = async options => {
    const messagesSnapshot = messages.value
    if (messagesSnapshot.length === 0) return null

    const lastMessage = messagesSnapshot[messagesSnapshot.length - 1]
    if (lastMessage.role === 'assistant') {
      return triggerRequest(messagesSnapshot.slice(0, -1), options)
    }
    return triggerRequest(messagesSnapshot, options)
  }

  const stop = () => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  const setMessages = (messages: Message[]) => {
    mutate(messages)
  }

  const input = ref(initialInput)

  const handleSubmit = (e: any) => {
    e.preventDefault()
    const inputValue = input.value
    if (!inputValue) return
    append({
      content: inputValue,
      role: 'user'
    })
    input.value = ''
  }

  return {
    messages,
    append,
    error,
    reload,
    stop,
    setMessages,
    input,
    handleSubmit,
    isLoading
  }
}
