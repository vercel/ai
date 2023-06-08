# ai-connector

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
