import { useSWR } from 'sswr'
import { Readable, get, readable, writable } from 'svelte/store'

import type { Message, CreateMessage } from '../shared/types'
import { Writable } from 'svelte/store'
import { decodeAIStreamChunk, nanoid } from '../shared/utils'

export type { Message, CreateMessage }

export type UseChatOptions = {
  /**
   * The API endpoint that accepts a `{ messages: Message[] }` object and returns
   * a stream of tokens of the AI chat response. Defaults to `/api/chat`.
   */
  api?: string

  /**
   * An unique identifier for the chat. If not provided, a random one will be
   * generated. When provided, the `useChat` hook with the same `id` will
   * have shared states across components.
   */
  id?: string

  /**
   * Initial messages of the chat. Useful to load an existing chat history.
   */
  initialMessages?: Message[]

  /**
   * Initial input of the chat.
   */
  initialInput?: string

  /**
   * Callback function to be called when the API response is received.
   */
  onResponse?: (response: Response) => void

  /**
   * Callback function to be called when the chat is finished streaming.
   */
  onFinish?: (message: Message) => void

  /**
   * HTTP headers to be sent with the API request.
   */
  headers?: Record<string, string> | Headers

  /**
   * Extra body to be sent with the API request.
   */
  body?: any

  /**
   * Whether to send extra message fields such as `message.id` and `message.createdAt` to the API.
   * Defaults to `false`. When set to `true`, the API endpoint might need to
   * handle the extra fields before forwarding the request to the AI service.
   */
  sendExtraMessageFields?: boolean
}

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Readable<Message[]>
  /** The error object of the API request */
  error: Readable<undefined | Error>
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   */
  append: (message: Message | CreateMessage) => void
  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, it will request the API to generate a
   * new response.
   */
  reload: () => void
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
  input: Writable<string>
  /** Form submission handler to automattically reset input and append a user message  */
  handleSubmit: (e: any) => void
  /** Whether the API request is in progress */
  isLoading: Writable<boolean>
}

let uniqueId = 0

const store: Record<string, any> = {}

export function useChat({
  api = '/api/chat',
  id,
  initialMessages = [],
  initialInput = '',
  sendExtraMessageFields,
  onResponse,
  onFinish,
  headers,
  body
}: UseChatOptions = {}): UseChatHelpers {
  // Generate a unique ID for the chat if not provided.
  const chatId = id || `chat-${uniqueId++}`

  const key = `${api}|${chatId}`
  const { data, mutate: originalMutate } = useSWR<Message[]>(key, {
    fetcher: () => store[key] || initialMessages,
    initialData: initialMessages
  })
  // Force the `data` to be `initialMessages` if it's `undefined`.
  data.set(initialMessages)

  const mutate = (data: Message[]) => {
    store[key] = data
    return originalMutate(data)
  }

  // Because of the `initialData` option, the `data` will never be `undefined`.
  const messages = data as Writable<Message[]>

  const error = writable<undefined | Error>(undefined)
  const isLoading = writable(false)

  let abortController: AbortController | null = null
  async function triggerRequest(messagesSnapshot: Message[]) {
    try {
      isLoading.set(true)
      abortController = new AbortController()

      // Do an optimistic update to the chat state to show the updated messages
      // immediately.
      const previousMessages = get(messages)
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
          ...body
        }),
        headers: headers || {},
        signal: abortController.signal
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
        throw new Error('Failed to fetch the chat response.')
      }
      if (!res.body) {
        throw new Error('The response body is empty.')
      }

      let result = ''
      const createdAt = new Date()
      const replyId = nanoid()
      const reader = res.body.getReader()

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        // Update the chat state with the new message tokens.
        result += decodeAIStreamChunk(value)
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

      error.set(err as Error)
    } finally {
      isLoading.set(false)
    }
  }

  const append = async (message: Message | CreateMessage) => {
    if (!message.id) {
      message.id = nanoid()
    }
    return triggerRequest(get(messages).concat(message as Message))
  }

  const reload = async () => {
    const messagesSnapshot = get(messages)
    if (messagesSnapshot.length === 0) return null

    const lastMessage = messagesSnapshot[messagesSnapshot.length - 1]
    if (lastMessage.role === 'assistant') {
      return triggerRequest(messagesSnapshot.slice(0, -1))
    }
    return triggerRequest(messagesSnapshot)
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

  const input = writable(initialInput)

  const handleSubmit = (e: any) => {
    e.preventDefault()
    const inputValue = get(input)
    if (!inputValue) return
    append({
      content: inputValue,
      role: 'user'
    })
    input.set('')
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
