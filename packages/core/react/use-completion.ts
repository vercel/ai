import { useCallback, useEffect, useId, useRef, useState } from 'react'
import useSWRMutation from 'swr/mutation'
import useSWR from 'swr'
import { decodeAIStreamChunk } from '../shared/utils'
import { UseCompletionOptions } from '../shared/types'

export type UseCompletionHelpers = {
  /** The current completion result */
  completion: string
  /**
   * Send a new prompt to the API endpoint and update the completion state.
   */
  complete: (prompt: string) => Promise<string | null | undefined>
  /** The error object of the API request */
  error: undefined | Error
  /**
   * Abort the current API request but keep the generated tokens.
   */
  stop: () => void
  /**
   * Update the `completion` state locally.
   */
  setCompletion: (completion: string) => void
  /** The current value of the input */
  input: string
  /** setState-powered method to update the input value */
  setInput: React.Dispatch<React.SetStateAction<string>>
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
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  /** Whether the API request is in progress */
  isLoading: boolean
}

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
  const hookId = useId()
  const completionId = id || hookId

  // Store the completion state in SWR, using the completionId as the key to share states.
  const { data, mutate } = useSWR<string>([api, completionId], null, {
    fallbackData: initialCompletion
  })
  const completion = data!

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
    string | null,
    any,
    [string, string],
    string
  >(
    [api, completionId],
    async (_, { arg: prompt }) => {
      try {
        const abortController = new AbortController()
        setAbortController(abortController)

        // Empty the completion immediately.
        mutate('', false)

        const res = await fetch(api, {
          method: 'POST',
          body: JSON.stringify({
            prompt,
            ...extraMetadataRef.current.body
          }),
          headers: extraMetadataRef.current.headers || {},
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

          // Update the completion state with the new message tokens.
          result += decodeAIStreamChunk(value)
          mutate(result, false)

          // The request has been aborted, stop reading the stream.
          if (abortController === null) {
            reader.cancel()
            break
          }
        }

        if (onFinish) {
          onFinish(prompt, result)
        }

        setAbortController(null)
        return result
      } catch (err) {
        // Ignore abort errors as they are expected.
        if ((err as any).name === 'AbortError') {
          setAbortController(null)
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

  const stop = useCallback(() => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
    }
  }, [abortController])

  const setCompletion = useCallback(
    (completion: string) => {
      mutate(completion, false)
    },
    [mutate]
  )

  const [input, setInput] = useState(initialInput)

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!input) return
      return trigger(input)
    },
    [input, trigger]
  )

  const handleInputChange = (e: any) => {
    setInput(e.target.value)
  }

  const complete = useCallback(
    async (prompt: string) => {
      return trigger(prompt)
    },
    [trigger]
  )

  return {
    completion,
    complete,
    error,
    setCompletion,
    stop,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading: isMutating
  }
}
