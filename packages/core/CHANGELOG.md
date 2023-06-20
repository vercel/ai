# ai

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
