import { useCallback, useId, useRef, useEffect, useState } from 'react'
import useSWRMutation from 'swr/mutation'
import useSWR from 'swr'
import { nanoid, decodeAIStreamChunk } from '../shared/utils'

import type { Message, CreateMessage, UseChatOptions } from '../shared/types'
export type { Message, CreateMessage, UseChatOptions }

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Message[]
  /** The error object of the API request */
  error: undefined | Error
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   */
  append: (
    message: Message | CreateMessage
  ) => Promise<string | null | undefined>
  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, it will request the API to generate a
   * new response.
   */
  reload: () => Promise<string | null | undefined>
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
  input: string
  /** setState-powered method to update the input value */
  setInput: React.Dispatch<React.SetStateAction<string>>
  /** An input/textarea-ready onChange handler to control the value of the input */
  handleInputChange: (e: any) => void
  /** Form submission handler to automattically reset input and append a user message  */
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  /** Whether the API request is in progress */
  isLoading: boolean
}

export function useChat({
  api = '/api/chat',
  id,
  initialMessages = [],
  initialInput = '',
  sendExtraMessageFields,
  onResponse,
  onFinish,
  onError,
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
  const abortControllerRef = useRef<AbortController | null>(null)

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
    string | null,
    any,
    [string, string],
    Message[]
  >(
    [api, chatId],
    async (_, { arg: messagesSnapshot }) => {
      try {
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        // Do an optimistic update to the chat state to show the updated messages
        // immediately.
        const previousMessages = messagesRef.current
        mutate(messagesSnapshot, false)

        const res = await fetch(api, {
          method: 'POST',
          body: JSON.stringify({
            messages: sendExtraMessageFields
              ? messagesSnapshot
              : messagesSnapshot.map(({ role, content }) => ({
                  role,
                  content
                })),
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

          // The request has been aborted, stop reading the stream.
          if (abortControllerRef.current === null) {
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

        abortControllerRef.current = null
        return result
      } catch (err) {
        // Ignore abort errors as they are expected.
        if ((err as any).name === 'AbortError') {
          abortControllerRef.current = null
          return null
        }

        if (onError && err instanceof Error) {
          onError(err)
        }

        throw err
      }
    },
    {
      populateCache: false,
      revalidate: false
    }
  )

  const append = useCallback(
    async (message: Message | CreateMessage) => {
      if (!message.id) {
        message.id = nanoid()
      }
      return trigger(messagesRef.current.concat(message as Message))
    },
    [trigger]
  )

  const reload = useCallback(async () => {
    if (messagesRef.current.length === 0) return null

    const lastMessage = messagesRef.current[messagesRef.current.length - 1]
    if (lastMessage.role === 'assistant') {
      return trigger(messagesRef.current.slice(0, -1))
    }
    return trigger(messagesRef.current)
  }, [trigger])

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  const setMessages = useCallback(
    (messages: Message[]) => {
      mutate(messages, false)
      messagesRef.current = messages
    },
    [mutate]
  )

  // Input state and handlers.
  const [input, setInput] = useState(initialInput)

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!input) return
      append({
        content: input,
        role: 'user',
        createdAt: new Date()
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
    setMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading: isMutating
  }
}
