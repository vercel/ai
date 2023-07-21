import { Accessor, Resource, Setter, createSignal } from 'solid-js'
import { createSWRStore } from 'swr-store'
import { useSWRStore } from 'solid-swr-store'

import type { UseCompletionOptions, RequestOptions } from '../shared/types'
import { createChunkDecoder } from '../shared/utils'

export type UseCompletionHelpers = {
  /** The current completion result */
  completion: Resource<string>
  /** The error object of the API request */
  error: Accessor<undefined | Error>
  /**
   * Send a new prompt to the API endpoint and update the completion state.
   */
  complete: (
    prompt: string,
    options?: RequestOptions
  ) => Promise<string | null | undefined>
  /**
   * Abort the current API request but keep the generated tokens.
   */
  stop: () => void
  /**
   * Update the `completion` state locally.
   */
  setCompletion: (completion: string) => void
  /** The current value of the input */
  input: Accessor<string>
  /** Signal Setter to update the input value */
  setInput: Setter<string>
  /**
   * Form submission handler to automattically reset input and append a user message
   * @example
   * ```jsx
   * <form onSubmit={handleSubmit}>
   *  <input value={input()} />
   * </form>
   * ```
   */
  handleSubmit: (e: any) => void
  /** Whether the API request is in progress */
  isLoading: Accessor<boolean>
}

let uniqueId = 0

const store: Record<string, any> = {}
const completionApiStore = createSWRStore<any, string[]>({
  get: async (key: string) => {
    return store[key] ?? []
  }
})

export function useCompletion({
  api = '/api/completion',
  id,
  initialCompletion = '',
  initialInput = '',
  credentials,
  headers,
  body,
  onResponse,
  onFinish,
  onError
}: UseCompletionOptions = {}): UseCompletionHelpers {
  // Generate an unique id for the completion if not provided.
  const completionId = id || `completion-${uniqueId++}`

  const key = `${api}|${completionId}`
  const data = useSWRStore(completionApiStore, () => [key], {
    initialData: initialCompletion
  })

  const mutate = (data: string) => {
    store[key] = data
    return completionApiStore.mutate([key], {
      data,
      status: 'success'
    })
  }

  // Because of the `initialData` option, the `data` will never be `undefined`.
  const completion = data as Resource<string>

  const [error, setError] = createSignal<undefined | Error>(undefined)
  const [isLoading, setIsLoading] = createSignal(false)

  let abortController: AbortController | null = null
  async function triggerRequest(prompt: string, options?: RequestOptions) {
    try {
      setIsLoading(true)
      abortController = new AbortController()

      // Empty the completion immediately.
      mutate('')

      const res = await fetch(api, {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          ...body,
          ...options?.body
        }),
        headers: {
          ...headers,
          ...options?.headers
        },
        signal: abortController.signal,
        credentials
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
        throw new Error(
          (await res.text()) || 'Failed to fetch the chat response.'
        )
      }

      if (!res.body) {
        throw new Error('The response body is empty.')
      }

      let result = ''
      const reader = res.body.getReader()
      const decoder = createChunkDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        // Update the chat state with the new message tokens.
        result += decoder(value)
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

      if (onError && error instanceof Error) {
        onError(error)
      }

      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const complete: UseCompletionHelpers['complete'] = async (
    prompt: string,
    options?: RequestOptions
  ) => {
    return triggerRequest(prompt, options)
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

  const [input, setInput] = createSignal(initialInput)

  const handleSubmit = (e: any) => {
    e.preventDefault()
    const inputValue = input()
    if (!inputValue) return
    return complete(inputValue)
  }

  return {
    completion,
    complete,
    error,
    stop,
    setCompletion,
    input,
    setInput,
    handleSubmit,
    isLoading
  }
}
