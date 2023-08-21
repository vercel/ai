# ai

## 2.2.7

### Patch Changes

- 2f97630: react/use-chat: fix aborting clientside function calls too early
- 1157340: fix: infinite loop for experimental stream data (#484)
## 2.2.6

### Patch Changes

- e5bf68d: react/use-chat: fix experimental functions returning proper function messages

  Closes #478

## 2.2.5

### Patch Changes

- e5bf68d: react/use-chat: fix experimental functions returning proper function messages

  Closes #478

## 2.2.4

### Patch Changes

- 7b389a7: fix: improve safety for type check in openai-stream

## 2.2.3

### Patch Changes

- 867a3f9: Fix client-side function calling (#467, #469)

  add Completion type from the `openai` SDK to openai-stream (#472)

## 2.2.2

### Patch Changes

- 84e0cc8: Add experimental_StreamData and new opt-in wire protocol to enable streaming additional data. See https://github.com/vercel/ai/pull/425.

  Changes `onCompletion` back to run every completion, including recursive function calls. Adds an `onFinish` callback that runs once everything has streamed.

  If you're using experimental function handlers on the server _and_ caching via `onCompletion`,
  you may want to adjust your caching code to account for recursive calls so the same key isn't used.

  ```
  let depth = 0

  const stream = OpenAIStream(response, {
      async onCompletion(completion) {
        depth++
        await kv.set(key + '_' + depth, completion)
        await kv.expire(key + '_' + depth, 60 * 60)
      }
    })
  ```

## 2.2.1

### Patch Changes

- 04084a8: openai-stream: fix experimental_onFunctionCall types for OpenAI SDK v4

## 2.2.0

### Minor Changes

- dca1ed9: Update packages and examples to use OpenAI SDK v4

## 2.1.34

### Patch Changes

- c2917d3: Add support for the Anthropic SDK, newer Anthropic API versions, and improve Anthropic error handling

## 2.1.33

### Patch Changes

- 4ef8015: Prevent `isLoading` in vue integration from triggering extraneous network requests

## 2.1.32

### Patch Changes

- 5f91427: ai/svelte: fix isLoading return value

## 2.1.31

### Patch Changes

- ab2b973: fix pnpm-lock.yaml

## 2.1.30

### Patch Changes

- 4df2a49: Fix termination of ReplicateStream by removing the terminating `{}`from output

## 2.1.29

### Patch Changes

- 3929a41: Add ReplicateStream helper

## 2.1.28

### Patch Changes

- 9012e17: react/svelte/vue: fix making unnecessary SWR request to API endpoint

## 2.1.27

### Patch Changes

- 3d29799: React/Svelte/Vue: keep isLoading in sync between hooks with the same ID.

  React: don't throw error when submitting

## 2.1.26

### Patch Changes

- f50d9ef: Add experimental_buildLlama2Prompt helper for Hugging Face

## 2.1.25

### Patch Changes

- 877c16f: ai/react: don't throw error if onError is passed

## 2.1.24

### Patch Changes

- f3f5866: Adds SolidJS support and SolidStart example

## 2.1.23

### Patch Changes

- 0ebc2f0: streams/openai-stream: don't call onStart/onCompletion when recursing

## 2.1.22

### Patch Changes

- 9320e95: Add (experimental) prompt construction helpers for StarChat and OpenAssistant
- e3a7ec8: Support <|end|> token for StarChat beta in huggingface-stream

## 2.1.21

### Patch Changes

- 561a49a: Providing a function to `function_call` request parameter of the OpenAI Chat Completions API no longer breaks OpenAI function stream parsing.

## 2.1.20

### Patch Changes

- e361114: OpenAI functions: allow returning string in callback

## 2.1.19

### Patch Changes

- e4281ca: Add experimental server-side OpenAI function handling

## 2.1.18

### Patch Changes

- 6648b21: Add experimental client side OpenAI function calling to Svelte bindings
- e5b983f: feat(streams): add http error handling for openai

## 2.1.17

### Patch Changes

- 3ed65bf: Remove dependency on node crypto API

## 2.1.16

### Patch Changes

- 8bfb43d: Fix svelte peer dependency version

## 2.1.15

### Patch Changes

- 4a2b978: Update cohere stream and add docs

## 2.1.14

### Patch Changes

- 3164adb: Fix regression with generated ids

## 2.1.13

### Patch Changes

- fd82961: Use rfc4122 IDs when generating chat/completion IDs

## 2.1.12

### Patch Changes

- b7b93e5: Add <Tokens> RSC to ai/react

## 2.1.11

### Patch Changes

- 8bf637a: Fix langchain handlers so that they now are correctly invoked and update examples and docs to show correct usage (passing the handlers to `llm.call` and not the model itself).

## 2.1.10

### Patch Changes

- a7b3d0e: Experimental support for OpenAI function calling

## 2.1.9

### Patch Changes

- 9cdf968: core/react: add Tokens react server component

## 2.1.8

### Patch Changes

- 44d9879: Support extra request options in chat and completion hooks

## 2.1.7

### Patch Changes

- bde3898: Allow an async onResponse callback in useChat/useCompletion

## 2.1.6

### Patch Changes

- 23f0899: Set stream: true when decoding streamed chunks

## 2.1.5

### Patch Changes

- 89938b0: Provider direct callback handlers in LangChain now that `CallbackManager` is deprecated.

## 2.1.4

### Patch Changes

- c16d650: Improve type saftey for AIStream. Added JSDoc comments.

## 2.1.3

### Patch Changes

- a9591fe: Add `createdAt` on `user` input message in `useChat` (it was already present in `assistant` messages)

## 2.1.2

### Patch Changes

- f37d4ec: fix bundling

## 2.1.1

### Patch Changes

- 9fdb51a: fix: add better typing for store within svelte implementation (#104)

## 2.1.0

### Minor Changes

- 71f9c51: This adds Vue support for `ai` via the `ai/vue` subpath export. Vue composables `useChat` and `useCompletion` are provided.

### Patch Changes

- ad54c79: add tests

## 2.0.1

### Patch Changes

- be90740: - Switches `LangChainStream` helper callback `handler` to return use `handleChainEnd` instead of `handleLLMEnd` so as to work with sequential chains

## 2.0.0

### Major Changes

- 095de43: New package name!

## 0.0.14

### Patch Changes

- c6586a2: Add onError callback, include response text in error if response is not okay

## 0.0.13

### Patch Changes

- c1f4a91: Throw error when provided AI response isn't valid

## 0.0.12

### Patch Changes

- ea4e66a: improve API types

## 0.0.11

### Patch Changes

- a6bc35c: fix package exports for react and svelte subpackages

## 0.0.10

### Patch Changes

- 56f9537: add svelte apis

## 0.0.9

### Patch Changes

- 78477d3: - Create `/react` sub-package.
  - Create `import { useChat, useCompletion } from 'ai/react'` and mark React as an optional peer dependency so we can add more framework support in the future.
  - Also renamed `set` to `setMessages` and `setCompletion` to unify the API naming as we have `setInput` too.
  - Added an `sendExtraMessageFields` field to `useChat` that defaults to `false`, to prevent OpenAI errors when `id` is not filtered out.
- c4c1be3: useCompletion.handleSubmit does not clear the input anymore
- 7de2185: create /react export

## 0.0.8

### Patch Changes

- fc83e95: Implement new start-of-stream newline trimming
- 2c6fa04: Optimize callbacks TransformStream to be more memory efficient when `onCompletion` is not specified

## 0.0.7

### Patch Changes

- fdfef52: - Splits the `EventSource` parser into a reusable helper
  - Uses a `TransformStream` for this, so the stream respects back-pressure
  - Splits the "forking" stream for callbacks into a reusable helper
  - Changes the signature for `customParser` to avoid Stringify -> Encode -> Decode -> Parse round trip
  - Uses ?.() optional call syntax for callbacks
  - Uses string.includes to perform newline checking
  - Handles the `null` `res.body` case
  - Fixes Anthropic's streaming responses
    - Anthropic returns cumulative responses, not deltas like OpenAI
    - https://github.com/hwchase17/langchain/blob/3af36943/langchain/llms/anthropic.py#L190-L193

## 0.0.6

### Patch Changes

- d70a9e7: Add streamToResponse
- 47b85b2: Improve abortController and callbacks of `useChat`
- 6f7b43a: Export `UseCompletionHelpers` as a TypeScript type alias

## 0.0.5

### Patch Changes

- 4405a8a: fix duplicated `'use client'` directives

## 0.0.4

### Patch Changes

- b869104: Added `LangChainStream`, `useCompletion`, and `useChat`

## 0.0.3

### Patch Changes

- 677d222: add useCompletion

## 0.0.2

### Patch Changes

- af400e2: Fix release script

## 0.0.1

### Patch Changes

- b7e227d: Add `useChat` hook

## 0.0.2

### Patch Changes

- 9a8a845: Testing out release
