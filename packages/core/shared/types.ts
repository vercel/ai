/**
 * Shared types between the API and UI packages.
 */
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
   * Callback function to be called when an error is encountered.
   */
  onError?: (error: Error) => void

  /**
   * HTTP headers to be sent with the API request.
   */
  headers?: Record<string, string> | Headers

  /**
   * Extra body object to be sent with the API request.
   * @example
   * Send a `sessionId` to the API along with the messages.
   * ```js
   * useChat({
   *   body: {
   *     sessionId: '123',
   *   }
   * })
   * ```
   */
  body?: object

  /**
   * Whether to send extra message fields such as `message.id` and `message.createdAt` to the API.
   * Defaults to `false`. When set to `true`, the API endpoint might need to
   * handle the extra fields before forwarding the request to the AI service.
   */
  sendExtraMessageFields?: boolean
}

export type UseCompletionOptions = {
  /**
   * The API endpoint that accepts a `{ prompt: string }` object and returns
   * a stream of tokens of the AI completion response. Defaults to `/api/completion`.
   */
  api?: string
  /**
   * An unique identifier for the chat. If not provided, a random one will be
   * generated. When provided, the `useChat` hook with the same `id` will
   * have shared states across components.
   */
  id?: string

  /**
   * Initial prompt input of the completion.
   */
  initialInput?: string

  /**
   * Initial completion result. Useful to load an existing history.
   */
  initialCompletion?: string

  /**
   * Callback function to be called when the API response is received.
   */
  onResponse?: (response: Response) => void
  /**
   * Callback function to be called when the completion is finished streaming.
   */
  onFinish?: (prompt: string, completion: string) => void

  /**
   * Callback function to be called when an error is encountered.
   */
  onError?: (error: Error) => void

  /**
   * HTTP headers to be sent with the API request.
   */
  headers?: Record<string, string> | Headers

  /**
   * Extra body object to be sent with the API request.
   * @example
   * Send a `sessionId` to the API along with the prompt.
   * ```js
   * useChat({
   *   body: {
   *     sessionId: '123',
   *   }
   * })
   * ```
   */
  body?: object
}
