import { Readable, get, writable, Writable, derived } from 'svelte/store'
import { useSWR } from 'sswr'
import { nanoid, createChunkDecoder } from '../shared/utils'

import type {
  ChatRequest,
  CreateMessage,
  Message,
  UseChatOptions,
  ChatRequestOptions
} from '../shared/types'
import { ChatCompletionMessage } from 'openai/resources/chat'
export type { Message, CreateMessage, UseChatOptions }

export type UseChatHelpers = {
  /** Current messages in the chat */
  messages: Readable<Message[]>
  /** The error object of the API request */
  error: Readable<undefined | Error>
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   * @param chatRequestOptions Additional options to pass to the API call
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
  input: Writable<string>
  /** Form submission handler to automattically reset input and append a user message  */
  handleSubmit: (e: any, chatRequestOptions?: ChatRequestOptions) => void
  metadata?: Object
  /** Whether the API request is in progress */
  isLoading: Readable<boolean | undefined>
}
const getStreamedResponse = async (
  api: string,
  chatRequest: ChatRequest,
  mutate: (messages: Message[]) => void,
  extraMetadata: {
    credentials?: RequestCredentials
    headers?: Record<string, string> | Headers
    body?: any
  },
  previousMessages: Message[],
  abortControllerRef: AbortController | null,
  onFinish?: (message: Message) => void,
  onResponse?: (response: Response) => void | Promise<void>,
  sendExtraMessageFields?: boolean
) => {
  // Do an optimistic update to the chat state to show the updated messages
  // immediately.
  mutate(chatRequest.messages)

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
      ...extraMetadata.body,
      ...chatRequest.options?.body,
      ...(chatRequest.functions !== undefined && {
        functions: chatRequest.functions
      }),
      ...(chatRequest.function_call !== undefined && {
        function_call: chatRequest.function_call
      })
    }),
    credentials: extraMetadata.credentials,
    headers: {
      ...extraMetadata.headers,
      ...chatRequest.options?.headers
    },
    ...(abortControllerRef !== null && {
      signal: abortControllerRef.signal
    })
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
    throw new Error((await res.text()) || 'Failed to fetch the chat response.')
  }

  if (!res.body) {
    throw new Error('The response body is empty.')
  }

  let streamedResponse = ''
  const createdAt = new Date()
  const replyId = nanoid()
  const reader = res.body.getReader()
  const decode = createChunkDecoder()

  let responseMessage: Message = {
    id: replyId,
    createdAt,
    content: '',
    role: 'assistant'
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    // Update the chat state with the new message tokens.
    streamedResponse += decode(value)

    // Check to see if there is a function, so we don't bother parsing if there isn't one.
    const functionStart = streamedResponse.indexOf('{')
    if (functionStart !== -1) {
      const matches = /(.*?)(?:({"function_call".*?}})(.*))?$/gs.exec(
        streamedResponse
      )
      responseMessage.content = `${matches?.[1] ?? ''}${matches?.[3] ?? ''}`
      // While the function call is streaming, it will be a string.
      responseMessage.function_call = matches?.[2]
    } else {
      responseMessage.content = streamedResponse
    }

    mutate([...chatRequest.messages, { ...responseMessage }])

    // The request has been aborted, stop reading the stream.
    if (abortControllerRef === null) {
      reader.cancel()
      break
    }
  }

  if (typeof responseMessage.function_call === 'string') {
    // Once the stream is complete, the function call is parsed into an object.
    const parsedFunctionCall: ChatCompletionMessage.FunctionCall = JSON.parse(
      responseMessage.function_call
    ).function_call

    responseMessage.function_call = parsedFunctionCall

    mutate([...chatRequest.messages, { ...responseMessage }])
  }

  if (onFinish) {
    onFinish(responseMessage)
  }

  return responseMessage
}

let uniqueId = 0

const store: Record<string, Message[] | undefined> = {}

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
  const chatId = id || `chat-${uniqueId++}`

  const key = `${api}|${chatId}`
  const {
    data,
    mutate: originalMutate,
    isLoading: isSWRLoading
  } = useSWR<Message[]>(key, {
    fetcher: () => store[key] || initialMessages,
    fallbackData: initialMessages
  })

  const loading = writable<boolean>(false)

  // Force the `data` to be `initialMessages` if it's `undefined`.
  data.set(initialMessages)

  const mutate = (data: Message[]) => {
    store[key] = data
    return originalMutate(data)
  }

  // Because of the `fallbackData` option, the `data` will never be `undefined`.
  const messages = data as Writable<Message[]>

  // Abort controller to cancel the current API call.
  let abortController: AbortController | null = null

  const extraMetadata = {
    credentials,
    headers,
    body
  }

  const error = writable<undefined | Error>(undefined)

  // Actual mutation hook to send messages to the API endpoint and update the
  // chat state.
  async function triggerRequest(chatRequest: ChatRequest) {
    try {
      loading.set(true)
      abortController = new AbortController()

      while (true) {
        const streamedResponseMessage = await getStreamedResponse(
          api,
          chatRequest,
          mutate,
          extraMetadata,
          get(messages),
          abortController,
          onFinish,
          onResponse,
          sendExtraMessageFields
        )

        if (
          streamedResponseMessage.function_call === undefined ||
          typeof streamedResponseMessage.function_call === 'string'
        ) {
          break
        }

        // Streamed response is a function call, invoke the function call handler if it exists.
        if (experimental_onFunctionCall) {
          const functionCall = streamedResponseMessage.function_call

          // User handles the function call in their own functionCallHandler.
          // The "arguments" of the function call object will still be a string which will have to be parsed in the function handler.
          // If the JSON is malformed due to model error the user will have to handle that themselves.

          const functionCallResponse: ChatRequest | void =
            await experimental_onFunctionCall(get(messages), functionCall)

          // If the user does not return anything as a result of the function call, the loop will break.
          if (functionCallResponse === undefined) break

          // A function call response was returned.
          // The updated chat with function call response will be sent to the API in the next iteration of the loop.
          chatRequest = functionCallResponse
        }
      }

      abortController = null

      return null
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        abortController = null
        return null
      }

      if (onError && err instanceof Error) {
        onError(err)
      }

      error.set(err as Error)
    } finally {
      loading.set(false)
    }
  }

  const append: UseChatHelpers['append'] = async (
    message: Message | CreateMessage,
    { options, functions, function_call }: ChatRequestOptions = {}
  ) => {
    if (!message.id) {
      message.id = nanoid()
    }

    const chatRequest: ChatRequest = {
      messages: get(messages).concat(message as Message),
      options,
      ...(functions !== undefined && { functions }),
      ...(function_call !== undefined && { function_call })
    }
    return triggerRequest(chatRequest)
  }

  const reload: UseChatHelpers['reload'] = async ({
    options,
    functions,
    function_call
  }: ChatRequestOptions = {}) => {
    const messagesSnapshot = get(messages)
    if (messagesSnapshot.length === 0) return null

    // Remove last assistant message and retry last user message.
    const lastMessage = messagesSnapshot.at(-1)
    if (lastMessage?.role === 'assistant') {
      const chatRequest: ChatRequest = {
        messages: messagesSnapshot.slice(0, -1),
        options,
        ...(functions !== undefined && { functions }),
        ...(function_call !== undefined && { function_call })
      }

      return triggerRequest(chatRequest)
    }
    const chatRequest: ChatRequest = {
      messages: messagesSnapshot,
      options,
      ...(functions !== undefined && { functions }),
      ...(function_call !== undefined && { function_call })
    }

    return triggerRequest(chatRequest)
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

  const handleSubmit = (e: any, options: ChatRequestOptions = {}) => {
    e.preventDefault()
    const inputValue = get(input)
    if (!inputValue) return

    append(
      {
        content: inputValue,
        role: 'user',
        createdAt: new Date()
      },
      options
    )
    input.set('')
  }

  const isLoading = derived(
    [isSWRLoading, loading],
    ([$isSWRLoading, $loading]) => {
      return $isSWRLoading || $loading
    }
  )

  return {
    messages,
    error,
    append,
    reload,
    stop,
    setMessages,
    input,
    handleSubmit,
    isLoading: isLoading
  }
}
