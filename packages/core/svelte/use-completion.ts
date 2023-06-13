import { useSWR } from 'sswr'
import { Readable, get, writable } from 'svelte/store'

import { Writable } from 'svelte/store'
import { decodeAIStreamChunk } from '../shared/utils'
import { UseCompletionOptions } from '../shared/types'

export type UseCompletionHelpers = {
  /** The current completion result */
  completion: Readable<string>
  /** The error object of the API request */
  error: Readable<undefined | Error>
  /**
   * Send a new prompt to the API endpoint and update the completion state.
   */
  complete: (prompt: string) => Promise<string | null | undefined>
  /**
   * Abort the current API request but keep the generated tokens.
   */
  stop: () => void
  /**
   * Update the `completion` state locally.
   */
  setCompletion: (completion: string) => void
  /** The current value of the input */
  input: Writable<string>
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

const store: Record<string, any> = {}

export function useCompletion({
  api = '/api/completion',
  id,
  initialCompletion = '',
  initialInput = '',
  headers,
  body,
  onResponse,
  onFinish,
  onError
}: UseCompletionOptions = {}): UseCompletionHelpers {
  // Generate an unique id for the completion if not provided.
  const completionId = id || `completion-${uniqueId++}`

  const key = `${api}|${completionId}`
  const { data, mutate: originalMutate } = useSWR<string>(key, {
    fetcher: () => store[key] || initialCompletion,
    initialData: initialCompletion
  })
  // Force the `data` to be `initialCompletion` if it's `undefined`.
  data.set(initialCompletion)

  const mutate = (data: string) => {
    store[key] = data
    return originalMutate(data)
  }

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
        throw new Error(
          (await res.text()) || 'Failed to fetch the chat response.'
        )
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

      if (onError && error instanceof Error) {
        onError(error)
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

  const input = writable(initialInput)

  const handleSubmit = (e: any) => {
    e.preventDefault()
    const inputValue = get(input)
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
    handleSubmit,
    isLoading
  }
}
