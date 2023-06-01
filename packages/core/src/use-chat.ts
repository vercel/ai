'use client'

import { useCallback, useId, useRef, useEffect, useState } from 'react'
import useSWRMutation from 'swr/mutation'
import useSWR from 'swr'
import { customAlphabet } from 'nanoid'

// 7-character random string
const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7
)

export type Message = {
  id: string
  createdAt?: Date
  content: string
  role: 'system' | 'user' | 'assistant'
}

export type CreateMessage = {
  id?: string
  createdAt?: Date
  content: string
  role: 'system' | 'user' | 'assistant'
}

const decoder = new TextDecoder()
function decodeAIStreamChunk(chunk: Uint8Array): string {
  const tokens = decoder.decode(chunk).split('\n')
  return tokens.map(t => (t ? JSON.parse(t) : '')).join('')
}

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
}

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Message[]
  /** SWR's error object */
  error: any
  /**
   * Append a  message to the chat list. This trigger the API call
   * to fetch to the API endpoint to get the AI response.
   */
  append: (message: Message | CreateMessage) => void
  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, this method will do nothing.
   */
  reload: () => void
  /** Abort the current API request. */
  stop: () => void
  /** Update the `messages` state locally. */
  set: (messages: Message[]) => void
  /** The current value of the input */
  input: string
  /** setState-powered method to update the input value */
  setInput: React.Dispatch<React.SetStateAction<string>>
  /** An input/textarea-ready onChange handler to control the value of the input */
  handleInputChange: (e: any) => void
  /** Form submission handler to automattically reset input and append a user message  */
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  /** Whether SWR-fetch is in progress */
  isLoading: boolean
}

export function useChat({
  api = '/api/chat',
  id,
  initialMessages = [],
  initialInput = '',
  onResponse,
  onFinish,
  headers,
  body
}: UseChatOptions = {}): UseChatHelpers {
  // Generate an unique id for the chat if not provided.
  const hookId = useId()
  const chatId = id || hookId

  // Store the chat state in SWR, using the chatId as the key to share states.
  const { data, mutate } = useSWR<Message[]>([api, chatId], null, {
    fallbackData: initialMessages
  })
  const messages = data!

  // Keep the latest messages in a ref.
  const messagesRef = useRef<Message[]>(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Abort controller to cancel the current API call.
  const [abortController, setAbortController] =
    useState<AbortController | null>(null)

  const extraMetadataRef = useRef<any>({
    headers,
    body
  })
  useEffect(() => {
    extraMetadataRef.current = {
      headers,
      body
    }
  }, [headers, body])

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
        const abortController = new AbortController()
        setAbortController(abortController)

        // Do an optimistic update to the chat state to show the updated messages
        // immediately.
        const previousMessages = messagesRef.current
        mutate(messagesSnapshot, false)

        const res = await fetch(api, {
          method: 'POST',
          body: JSON.stringify({
            messages: messagesSnapshot,
            ...extraMetadataRef.current.body
          }),
          headers: extraMetadataRef.current.headers || {},
          signal: abortController.signal
        }).catch(err => {
          // Restore the previous messages if the request fails.
          mutate(previousMessages, false)
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
          mutate(previousMessages, false)
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
          mutate(
            [
              ...messagesSnapshot,
              {
                id: replyId,
                createdAt,
                content: result,
                role: 'assistant'
              }
            ],
            false
          )
        }

        if (onFinish) {
          onFinish({
            id: replyId,
            createdAt,
            content: result,
            role: 'assistant'
          })
        }

        setAbortController(null)
        return null
      } catch (err) {
        // Ignore abort errors as they are expected.
        if ((err as any).name === 'AbortError') {
          setAbortController(null)
          return null
        }

        throw err
      }
    },
    {
      populateCache: false,
      revalidate: false
    }
  )

  /**
   * Append a user message to the chat list, and trigger the API call to fetch
   * the assistant's response.
   */
  const append = useCallback((message: Message | CreateMessage) => {
    if (!message.id) {
      message.id = nanoid()
    }
    trigger(messagesRef.current.concat(message as Message))
  }, [])

  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, this method will do nothing.
   */
  const reload = useCallback(() => {
    if (messagesRef.current.length === 0) return

    if (
      messagesRef.current[messagesRef.current.length - 1].role !== 'assistant'
    )
      return

    trigger(messagesRef.current.slice(0, -1))
  }, [])

  /**
   * Abort the current API request but keep the generated tokens.
   */
  const stop = useCallback(() => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
    }
  }, [abortController])

  /**
   * Update the `messages` state locally. This is useful when you want to
   * edit the messages on the client, and then trigger the `reload` method
   * to regenerate the AI response.
   */
  const set = useCallback((messages: Message[]) => {
    mutate(messages, false)
    messagesRef.current = messages
  }, [])

  const [input, setInput] = useState(initialInput)

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!input) return
      append({
        content: input,
        role: 'user'
      })
      setInput('')
    },
    [input, append]
  )

  const handleInputChange = (e: any) => {
    setInput(e.target.value)
  }

  return {
    messages,
    error,
    append,
    reload,
    stop,
    set,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading: isMutating
  }
}
