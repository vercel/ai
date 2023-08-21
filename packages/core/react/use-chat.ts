import { useCallback, useEffect, useId, useRef, useState } from 'react'
import useSWR, { KeyedMutator } from 'swr'
import { nanoid, createChunkDecoder, COMPLEX_HEADER } from '../shared/utils'

import type {
  ChatRequest,
  CreateMessage,
  Message,
  UseChatOptions,
  ChatRequestOptions
} from '../shared/types'
import { CreateChatCompletionRequestMessage } from 'openai/resources/chat'
export type { Message, CreateMessage, UseChatOptions }

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Message[]
  /** The error object of the API request */
  error: undefined | Error
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param options Additional options to pass to the API call
   */
  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions
  ) => Promise<string | null | undefined>
  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, it will request the API to generate a
   * new response.
   */
  reload: (
    chatRequestOptions?: ChatRequestOptions
  ) => Promise<string | null | undefined>
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
  handleInputChange: (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
  ) => void
  /** Form submission handler to automattically reset input and append a user message  */
  handleSubmit: (
    e: React.FormEvent<HTMLFormElement>,
    chatRequestOptions?: ChatRequestOptions
  ) => void
  metadata?: Object
  /** Whether the API request is in progress */
  isLoading: boolean
  /** Additional data added on the server via StreamData */
  data?: any
}

const getStreamedResponse = async (
  api: string,
  chatRequest: ChatRequest,
  mutate: KeyedMutator<Message[]>,
  mutateStreamData: KeyedMutator<any[]>,
  existingData: any,
  extraMetadataRef: React.MutableRefObject<any>,
  messagesRef: React.MutableRefObject<Message[]>,
  abortControllerRef: React.MutableRefObject<AbortController | null>,
  onFinish?: (message: Message) => void,
  onResponse?: (response: Response) => void | Promise<void>,
  sendExtraMessageFields?: boolean
) => {
  // Do an optimistic update to the chat state to show the updated messages
  // immediately.
  const previousMessages = messagesRef.current
  mutate(chatRequest.messages, false)

  const res = await fetch(api, {
    method: 'POST',
    body: JSON.stringify({
      messages: sendExtraMessageFields
        ? chatRequest.messages
        : chatRequest.messages.map(
            ({ role, content, name, function_call }) => ({
              role,
              content,
              ...(name !== undefined && { name }),
              ...(function_call !== undefined && {
                function_call: function_call
              })
            })
          ),
      ...extraMetadataRef.current.body,
      ...chatRequest.options?.body,
      ...(chatRequest.functions !== undefined && {
        functions: chatRequest.functions
      }),
      ...(chatRequest.function_call !== undefined && {
        function_call: chatRequest.function_call
      })
    }),
    credentials: extraMetadataRef.current.credentials,
    headers: {
      ...extraMetadataRef.current.headers,
      ...chatRequest.options?.headers
    },
    ...(abortControllerRef.current !== null && {
      signal: abortControllerRef.current.signal
    })
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
    throw new Error((await res.text()) || 'Failed to fetch the chat response.')
  }

  if (!res.body) {
    throw new Error('The response body is empty.')
  }

  const isComplexMode = res.headers.get(COMPLEX_HEADER) === 'true'
  const createdAt = new Date()
  const reader = res.body.getReader()
  const decode = createChunkDecoder(isComplexMode)
  let responseMessages: Message[] = []

  // END TODO-STREAMDATA
  let responseData: any = []
  type PrefixMap = {
    text?: Message
    function_call?: string | CreateChatCompletionRequestMessage
    data?: string[]
  }

  const prefixMap: PrefixMap = {}

  if (isComplexMode) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      // Update the chat state with the new message tokens.
      const lines = decode(value)
      if (typeof lines === 'string') {
        throw new Error(
          'Invalid response format. Complex mode was set but the response is a string. This should never happen.'
        )
      }

      // we create a map of each prefix, and for each prefixed message we push to the map
      for (const { type, value } of lines) {
        if (type === 'text') {
          if (prefixMap['text']) {
            prefixMap['text'] = {
              ...prefixMap['text'],
              content: (prefixMap['text'].content || '') + value
            }
          } else {
            prefixMap['text'] = {
              id: nanoid(),
              role: 'assistant',
              content: value,
              createdAt
            }
          }
        }

        let functionCallMessage: Message | null = null

        if (type === 'function_call') {
          prefixMap['function_call'] = value

          let functionCall = prefixMap['function_call']
          // Ensure it hasn't been parsed
          if (functionCall && typeof functionCall === 'string') {
            const parsedFunctionCall: CreateChatCompletionRequestMessage.FunctionCall =
              JSON.parse(functionCall as string).function_call

            functionCallMessage = {
              id: nanoid(),
              role: 'assistant',
              content: '',
              function_call: parsedFunctionCall,
              name: parsedFunctionCall.name,
              createdAt
            }

            prefixMap['function_call'] = functionCallMessage as any
          }
        }

        if (type === 'data') {
          const parsedValue = JSON.parse(value)
          if (prefixMap['data']) {
            prefixMap['data'] = [...prefixMap['data'], ...parsedValue]
          } else {
            prefixMap['data'] = parsedValue
          }
        }

        const data = prefixMap['data']
        const responseMessage = prefixMap['text']

        // We add function calls and response messages to the messages[], but data is its own thing
        const merged = [functionCallMessage, responseMessage].filter(
          Boolean
        ) as Message[]

        mutate([...chatRequest.messages, ...merged], false)
        mutateStreamData([...(existingData || []), ...(data || [])], false)

        // The request has been aborted, stop reading the stream.
        if (abortControllerRef.current === null) {
          reader.cancel()
          break
        }
      }
    }

    for (const [type, item] of Object.entries(prefixMap)) {
      if (onFinish && type === 'text') {
        onFinish(item as Message)
      }
      if (type === 'data') {
        responseData.push(item)
      } else {
        responseMessages.push(item as Message)
      }
    }
    return { messages: responseMessages, data: responseData }
  } else {
    // TODO-STREAMDATA: Remove this once Strem Data is not experimental
    let streamedResponse = ''
    const replyId = nanoid()
    let responseMessage: Message = {
      id: replyId,
      createdAt,
      content: '',
      role: 'assistant'
    }

    // TODO-STREAMDATA: Remove this once Strem Data is not experimental
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      // Update the chat state with the new message tokens.
      streamedResponse += decode(value)

      if (streamedResponse.startsWith('{"function_call":')) {
        // While the function call is streaming, it will be a string.
        responseMessage['function_call'] = streamedResponse
      } else {
        responseMessage['content'] = streamedResponse
      }

      mutate([...chatRequest.messages, { ...responseMessage }], false)

      // The request has been aborted, stop reading the stream.
      if (abortControllerRef.current === null) {
        reader.cancel()
        break
      }
    }

    if (streamedResponse.startsWith('{"function_call":')) {
      // Once the stream is complete, the function call is parsed into an object.
      const parsedFunctionCall: CreateChatCompletionRequestMessage.FunctionCall =
        JSON.parse(streamedResponse).function_call

      responseMessage['function_call'] = parsedFunctionCall

      mutate([...chatRequest.messages, { ...responseMessage }])
    }

    if (onFinish) {
      onFinish(responseMessage)
    }

    return responseMessage
  }
}

export function useChat({
  api = '/api/chat',
  id,
  initialMessages = [],
  initialInput = '',
  sendExtraMessageFields,
  experimental_onFunctionCall,
  onResponse,
  onFinish,
  onError,
  credentials,
  headers,
  body
}: UseChatOptions = {}): UseChatHelpers {
  // Generate a unique id for the chat if not provided.
  const hookId = useId()
  const chatId = id || hookId

  // Store the chat state in SWR, using the chatId as the key to share states.
  const { data: messages, mutate } = useSWR<Message[]>([api, chatId], null, {
    fallbackData: initialMessages
  })

  // We store loading state in another hook to sync loading states across hook invocations
  const { data: isLoading = false, mutate: mutateLoading } = useSWR<boolean>(
    [chatId, 'loading'],
    null
  )

  const { data: streamData, mutate: mutateStreamData } = useSWR<any>(
    [chatId, 'streamData'],
    null
  )

  // Keep the latest messages in a ref.
  const messagesRef = useRef<Message[]>(messages || [])
  useEffect(() => {
    messagesRef.current = messages || []
  }, [messages])

  // Abort controller to cancel the current API call.
  const abortControllerRef = useRef<AbortController | null>(null)

  const extraMetadataRef = useRef({
    credentials,
    headers,
    body
  })
  useEffect(() => {
    extraMetadataRef.current = {
      credentials,
      headers,
      body
    }
  }, [credentials, headers, body])

  // Actual mutation hook to send messages to the API endpoint and update the
  // chat state.
  const [error, setError] = useState<undefined | Error>()

  async function triggerRequest(chatRequest: ChatRequest) {
    try {
      mutateLoading(true)
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      while (true) {
        // TODO-STREAMDATA: This should be {  const { messages: streamedResponseMessages, data } =
        // await getStreamedResponse(} once Stream Data is not experimental
        const messagesAndDataOrJustMessage = await getStreamedResponse(
          api,
          chatRequest,
          mutate,
          mutateStreamData,
          streamData,
          extraMetadataRef,
          messagesRef,
          abortControllerRef,
          onFinish,
          onResponse,
          sendExtraMessageFields
        )

        // Using experimental stream data
        if ('messages' in messagesAndDataOrJustMessage) {
          let hasFollowingResponse = false
          for (const message of messagesAndDataOrJustMessage.messages) {
            if (
              message.function_call === undefined ||
              typeof message.function_call === 'string'
            ) {
              continue
            }
            hasFollowingResponse = true
            // Streamed response is a function call, invoke the function call handler if it exists.
            if (experimental_onFunctionCall) {
              const functionCall = message.function_call

              // User handles the function call in their own functionCallHandler.
              // The "arguments" key of the function call object will still be a string which will have to be parsed in the function handler.
              // If the "arguments" JSON is malformed due to model error the user will have to handle that themselves.

              const functionCallResponse: ChatRequest | void =
                await experimental_onFunctionCall(
                  messagesRef.current,
                  functionCall
                )

              // If the user does not return anything as a result of the function call, the loop will break.
              if (functionCallResponse === undefined) break

              // A function call response was returned.
              // The updated chat with function call response will be sent to the API in the next iteration of the loop.
              chatRequest = functionCallResponse
            }
          }
          if (!hasFollowingResponse) {
            break
          }
        } else {
          const streamedResponseMessage = messagesAndDataOrJustMessage
          // TODO-STREAMDATA: Remove this once Stream Data is not experimental
          if (
            streamedResponseMessage.function_call === undefined ||
            typeof streamedResponseMessage.function_call === 'string'
          ) {
            break
          }

          // Streamed response is a function call, invoke the function call handler if it exists.
          if (experimental_onFunctionCall) {
            const functionCall = streamedResponseMessage.function_call
            const functionCallResponse: ChatRequest | void =
              await experimental_onFunctionCall(
                messagesRef.current,
                functionCall
              )

            // If the user does not return anything as a result of the function call, the loop will break.
            if (functionCallResponse === undefined) break
            // A function call response was returned.
            // The updated chat with function call response will be sent to the API in the next iteration of the loop.
            chatRequest = functionCallResponse
          }
        }
      }

      abortControllerRef.current = null
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        abortControllerRef.current = null
        return null
      }

      if (onError && err instanceof Error) {
        onError(err)
      }

      setError(err as Error)
    } finally {
      mutateLoading(false)
    }
  }

  const append = useCallback(
    async (
      message: Message | CreateMessage,
      { options, functions, function_call }: ChatRequestOptions = {}
    ) => {
      if (!message.id) {
        message.id = nanoid()
      }

      const chatRequest: ChatRequest = {
        messages: messagesRef.current.concat(message as Message),
        options,
        ...(functions !== undefined && { functions }),
        ...(function_call !== undefined && { function_call })
      }

      return triggerRequest(chatRequest)
    },
    [triggerRequest]
  )

  const reload = useCallback(
    async ({ options, functions, function_call }: ChatRequestOptions = {}) => {
      if (messagesRef.current.length === 0) return null

      // Remove last assistant message and retry last user message.
      const lastMessage = messagesRef.current[messagesRef.current.length - 1]
      if (lastMessage.role === 'assistant') {
        const chatRequest: ChatRequest = {
          messages: messagesRef.current.slice(0, -1),
          options,
          ...(functions !== undefined && { functions }),
          ...(function_call !== undefined && { function_call })
        }

        return triggerRequest(chatRequest)
      }

      const chatRequest: ChatRequest = {
        messages: messagesRef.current,
        options,
        ...(functions !== undefined && { functions }),
        ...(function_call !== undefined && { function_call })
      }

      return triggerRequest(chatRequest)
    },
    [triggerRequest]
  )

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
    (
      e: React.FormEvent<HTMLFormElement>,
      { options, functions, function_call }: ChatRequestOptions = {},
      metadata?: Object
    ) => {
      if (metadata) {
        extraMetadataRef.current = {
          ...extraMetadataRef.current,
          ...metadata
        }
      }

      e.preventDefault()
      if (!input) return

      append(
        {
          content: input,
          role: 'user',
          createdAt: new Date()
        },
        { options, functions, function_call }
      )
      setInput('')
    },
    [input, append]
  )

  const handleInputChange = (e: any) => {
    setInput(e.target.value)
  }

  return {
    messages: messages || [],
    error,
    append,
    reload,
    stop,
    setMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    data: streamData
  }
}
