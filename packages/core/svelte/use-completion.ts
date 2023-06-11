import { useSWR } from 'sswr'
import { Readable, get, readable, writable } from 'svelte/store'

import { Writable } from 'svelte/store'
import { decodeAIStreamChunk } from '../shared/utils'

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
   * HTTP headers to be sent with the API request.
   */
  headers?: Record<string, string> | Headers

  /**
   * Extra body to be sent with the API request.
   */
  body?: any
}

export type UseCompletionHelpers = {
  /** The current completion result */
  completion: Readable<string>
  /** The error object of the API request */
  error: Readable<undefined | Error>
  /**
   * Send a new prompt to the API endpoint and update the completion state.
   */
  complete: (prompt: string) => void
  /**
   * Abort the current API request but keep the generated tokens.
   */
  stop: () => void
  /**
   * Update the `completion` state locally.
   */
  setCompletion: (completion: string) => void
  /** The current value of the input */
  input: Readable<string>
  /** Method to update the input value */
  setInput: (input: string) => void
  /**
   * An input/textarea-ready onChange handler to control the value of the input
   * @example
   * ```jsx
   * <input onChange={handleInputChange} value={input} />
   * ```
   */
  handleInputChange: (e: any) => void
  /**
   * Form submission handler to automattically reset input and append a user message
   * @example
   * ```jsx
   * <form onSubmit={handleSubmit}>
   *  <input onChange={handleInputChange} value={input} />
   * </form>
   * ```
   */
  handleSubmit: (e: any) => void
  /** Whether the API request is in progress */
  isLoading: Writable<boolean>
}

let uniqueId = 0

export function useCompletion({
  api = '/api/completion',
  id,
  initialCompletion = '',
  initialInput = '',
  headers,
  body,
  onResponse,
  onFinish
}: UseCompletionOptions = {}): UseCompletionHelpers {
  // Generate an unique id for the completion if not provided.
  const completionId = id || `completion-${uniqueId++}`

  const { data, mutate } = useSWR<string>(`${api}|${completionId}`, {
    fetcher: undefined,
    initialData: initialCompletion
  })
  // Because of the `initialData` option, the `data` will never be `undefined`.
  const completion = data as Writable<string>

  const error = writable<undefined | Error>(undefined)
  const isLoading = writable(false)

  let abortController: AbortController | null = null
  async function triggerRequest(prompt: string) {
    try {
      isLoading.set(true)
      abortController = new AbortController()

      // Empty the completion immediately.
      mutate('')

      const res = await fetch(api, {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          ...body
        }),
        headers: headers || {},
        signal: abortController.signal
      }).catch(err => {
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
        throw new Error('Failed to fetch the chat response.')
      }
      if (!res.body) {
        throw new Error('The response body is empty.')
      }

      let result = ''
      const reader = res.body.getReader()

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        // Update the chat state with the new message tokens.
        result += decodeAIStreamChunk(value)
        mutate(result)

        // The request has been aborted, stop reading the stream.
        if (abortController === null) {
          reader.cancel()
          break
        }
      }

      if (onFinish) {
        onFinish(prompt, result)
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

  const complete = async (prompt: string) => {
    return triggerRequest(prompt)
  }

  const stop = () => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  const setCompletion = (completion: string) => {
    mutate(completion)
  }

  let setInput: (input: string) => void
  const input = readable(initialInput, set => {
    setInput = set
  })
  input.subscribe(v => {})

  const handleSubmit = (e: any) => {
    e.preventDefault()
    const inputValue = get(input)
    if (!inputValue) return
    return complete(inputValue)
  }

  const handleInputChange = (e: any) => {
    setInput(e.target.value)
  }

  return {
    completion,
    complete,
    error,
    stop,
    setCompletion,
    input,
    setInput: setInput!,
    handleInputChange,
    handleSubmit,
    isLoading
  }
}
