# ai

## 3.2.8

### Patch Changes

- 54bf4083: feat (ai/react): control request body in useChat
- Updated dependencies [54bf4083]
  - @ai-sdk/ui-utils@0.0.6
  - @ai-sdk/react@0.0.8
  - @ai-sdk/solid@0.0.7
  - @ai-sdk/svelte@0.0.7
  - @ai-sdk/vue@0.0.7

## 3.2.7

### Patch Changes

- d42b8907: feat (ui): make event in handleSubmit optional
- Updated dependencies [d42b8907]
  - @ai-sdk/svelte@0.0.6
  - @ai-sdk/react@0.0.7
  - @ai-sdk/solid@0.0.6
  - @ai-sdk/vue@0.0.6

## 3.2.6

### Patch Changes

- 74e28222: fix (ai/rsc): "could not find InternalStreamableUIClient" bug

## 3.2.5

### Patch Changes

- 4d426d0c: fix (ai): split provider and model ids correctly in the provider registry

## 3.2.4

### Patch Changes

- Updated dependencies [3cb103bc]
  - @ai-sdk/react@0.0.6

## 3.2.3

### Patch Changes

- 89b7552b: chore (ai): remove deprecation from ai/react imports, add experimental_useObject
- Updated dependencies [02f6a088]
  - @ai-sdk/provider-utils@0.0.16
  - @ai-sdk/react@0.0.5
  - @ai-sdk/svelte@0.0.5
  - @ai-sdk/ui-utils@0.0.5
  - @ai-sdk/solid@0.0.5
  - @ai-sdk/vue@0.0.5

## 3.2.2

### Patch Changes

- 0565cd72: feat (ai/core): add toJsonResponse to generateObject result.

## 3.2.1

### Patch Changes

- 008725ec: feat (ai): add textStream, toTextStreamResponse(), and pipeTextStreamToResponse() to streamObject
- 520fb2d5: feat (rsc): add streamUI onFinish callback
- Updated dependencies [008725ec]
- Updated dependencies [008725ec]
  - @ai-sdk/react@0.0.4
  - @ai-sdk/ui-utils@0.0.4
  - @ai-sdk/solid@0.0.4
  - @ai-sdk/svelte@0.0.4
  - @ai-sdk/vue@0.0.4

## 3.2.0

### Minor Changes

- 85ef6d18: chore (ai): AI SDK 3.2 release

### Patch Changes

- b965dd2d: fix (core): pass settings correctly for generateObject and streamObject

## 3.1.37

### Patch Changes

- 85712895: chore (@ai-sdk/provider-utils): move test helper to provider utils
- Updated dependencies [85712895]
- Updated dependencies [85712895]
  - @ai-sdk/provider-utils@0.0.15
  - @ai-sdk/react@0.0.3
  - @ai-sdk/svelte@0.0.3
  - @ai-sdk/ui-utils@0.0.3
  - @ai-sdk/solid@0.0.3
  - @ai-sdk/vue@0.0.3

## 3.1.36

### Patch Changes

- 4728c37f: feat (core): add text embedding model support to provider registry
- 8c49166e: chore (core): rename experimental_createModelRegistry to experimental_createProviderRegistry
- Updated dependencies [7910ae84]
  - @ai-sdk/provider-utils@0.0.14
  - @ai-sdk/react@0.0.2
  - @ai-sdk/svelte@0.0.2
  - @ai-sdk/ui-utils@0.0.2
  - @ai-sdk/solid@0.0.2
  - @ai-sdk/vue@0.0.2

## 3.1.35

### Patch Changes

- 06123501: feat (core): support https and data url strings in image parts

## 3.1.34

### Patch Changes

- d25566ac: feat (core): add cosineSimilarity helper function
- 87a5d27e: feat (core): introduce InvalidMessageRoleError.

## 3.1.33

### Patch Changes

- 6fb14b5d: chore (streams): deprecate nanoid export.
- 05536768: feat (core): add experimental model registry

## 3.1.32

### Patch Changes

- 3cabf078: fix(ai/rsc): Refactor streamable UI internal implementation

## 3.1.31

### Patch Changes

- 85f209a4: chore: extracted ui library support into separate modules
- 85f209a4: removed (streams): experimental_StreamingReactResponse was removed. Please use AI SDK RSC instead.
- Updated dependencies [85f209a4]
  - @ai-sdk/ui-utils@0.0.1
  - @ai-sdk/svelte@0.0.1
  - @ai-sdk/react@0.0.1
  - @ai-sdk/solid@0.0.1
  - @ai-sdk/vue@0.0.1

## 3.1.30

### Patch Changes

- fcf4323b: fix (core): filter out empty assistant text messages

## 3.1.29

### Patch Changes

- 28427d3e: feat (core): add streamObject onFinish callback

## 3.1.28

### Patch Changes

- 102ca22f: feat (core): add object promise to streamObject result
- Updated dependencies [102ca22f]
  - @ai-sdk/provider@0.0.10
  - @ai-sdk/provider-utils@0.0.13

## 3.1.27

### Patch Changes

- c9198d4d: feat (ui): send annotation and data fields in useChat when sendExtraMessageFields is true
- Updated dependencies [09295e2e]
- Updated dependencies [09295e2e]
- Updated dependencies [043a5de2]
  - @ai-sdk/provider@0.0.9
  - @ai-sdk/provider-utils@0.0.12

## 3.1.26

### Patch Changes

- 5ee44cae: feat (provider): langchain StringOutputParser support

## 3.1.25

### Patch Changes

- ff281126: fix(ai/rsc): Remove extra reconcilation of streamUI

## 3.1.24

### Patch Changes

- 93cae126: fix(ai/rsc): Fix unsafe {} type in application code for StreamableValue
- 08b5c509: feat (core): add tokenUsage to streamObject result

## 3.1.23

### Patch Changes

- c03cafe6: chore (core, ui): rename maxAutomaticRoundtrips to maxToolRoundtrips

## 3.1.22

### Patch Changes

- 14bb8694: chore (ui): move maxAutomaticRoundtrips and addToolResult out of experimental

## 3.1.21

### Patch Changes

- 213f2411: fix (core,streams): support ResponseInit variants
- 09698bca: chore (streams): deprecate streaming helpers that have a provider replacement

## 3.1.20

### Patch Changes

- 0e1da476: feat (core): add maxAutomaticRoundtrips setting to generateText

## 3.1.19

### Patch Changes

- 9882d24b: fix (ui/svelte): send data to server
- 131bbd3e: fix (ui): remove console.log statements

## 3.1.18

### Patch Changes

- f9dee8ac: fix(ai/rsc): Fix types for createStreamableValue and createStreamableUI
- 1c0ebf8e: feat (core): add responseMessages to generateText result

## 3.1.17

### Patch Changes

- 92b993b7: ai/rsc: improve getAIState and getMutableAIState types
- 7de628e9: chore (ui): deprecate old function/tool call handling
- 7de628e9: feat (ui): add onToolCall handler to useChat

## 3.1.16

### Patch Changes

- f39c0dd2: feat (core, rsc): add toolChoice setting
- Updated dependencies [f39c0dd2]
  - @ai-sdk/provider@0.0.8
  - @ai-sdk/provider-utils@0.0.11

## 3.1.15

### Patch Changes

- 8e780288: feat (ai/core): add onFinish callback to streamText
- 8e780288: feat (ai/core): add text, toolCalls, and toolResults promises to StreamTextResult (matching the generateText result API with async methods)
- Updated dependencies [8e780288]
  - @ai-sdk/provider@0.0.7
  - @ai-sdk/provider-utils@0.0.10

## 3.1.14

### Patch Changes

- 6109c6a: feat (ai/react): add experimental_maxAutomaticRoundtrips to useChat

## 3.1.13

### Patch Changes

- 60117c9: dependencies (ai/ui): add React 18.3 and 19 support (peer dependency)
- Updated dependencies [6a50ac4]
- Updated dependencies [6a50ac4]
  - @ai-sdk/provider@0.0.6
  - @ai-sdk/provider-utils@0.0.9

## 3.1.12

### Patch Changes

- ae05fb7: feat (ai/streams): add StreamData support to streamToResponse

## 3.1.11

### Patch Changes

- a085d42: fix (ai/ui): decouple StreamData chunks from LLM stream

## 3.1.10

### Patch Changes

- 3a21030: feat (ai/core): add embedMany function

## 3.1.9

### Patch Changes

- 18a9655: feat (ai/svelte): add useAssistant

## 3.1.8

### Patch Changes

- 0f6bc4e: feat (ai/core): add embed function
- Updated dependencies [0f6bc4e]
  - @ai-sdk/provider@0.0.5
  - @ai-sdk/provider-utils@0.0.8

## 3.1.7

### Patch Changes

- f617b97: feat (ai): support client/server tool calls with useChat and streamText

## 3.1.6

### Patch Changes

- 2e78acb: Deprecate StreamingReactResponse (use AI SDK RSC instead).
- 8439884: ai/rsc: make RSC streamable utils chainable
- 325ca55: feat (ai/core): improve image content part error message
- Updated dependencies [325ca55]
  - @ai-sdk/provider@0.0.4
  - @ai-sdk/provider-utils@0.0.7

## 3.1.5

### Patch Changes

- 5b01c13: feat (ai/core): add system message support in messages list

## 3.1.4

### Patch Changes

- ceb44bc: feat (ai/ui): add stop() helper to useAssistant (important: AssistantResponse now requires OpenAI SDK 4.42+)
- 37c9d4c: feat (ai/streams): add LangChainAdapter.toAIStream()

## 3.1.3

### Patch Changes

- 970a099: fix (ai/core): streamObject fixes partial json with empty objects correctly
- 1ac2390: feat (ai/core): add usage and finishReason to streamText result.
- Updated dependencies [276f22b]
  - @ai-sdk/provider-utils@0.0.6

## 3.1.2

### Patch Changes

- d1b1880: fix (ai/core): allow reading streams in streamText result multiple times

## 3.1.1

### Patch Changes

- 0f77132: ai/rsc: remove experimental\_ from streamUI

## 3.1.0

### Minor Changes

- 73356a9: Move AI Core functions out of experimental (streamText, generateText, streamObject, generateObject).

## 3.0.35

### Patch Changes

- 41d5736: ai/core: re-expose language model types.
- b4c68ec: ai/rsc: ReadableStream as provider for createStreamableValue; add .append() method
- Updated dependencies [41d5736]
  - @ai-sdk/provider@0.0.3
  - @ai-sdk/provider-utils@0.0.5

## 3.0.34

### Patch Changes

- b9a831e: ai/rsc: add experimental_streamUI()

## 3.0.33

### Patch Changes

- 56ef84a: ai/core: fix abort handling in transformation stream
- Updated dependencies [56ef84a]
  - @ai-sdk/provider-utils@0.0.4

## 3.0.32

### Patch Changes

- 0e0d2af: ai/core: add pipeTextStreamToResponse helper to streamText.

## 3.0.31

### Patch Changes

- 74c63b1: ai/core: add toAIStreamResponse() helper to streamText.

## 3.0.30

### Patch Changes

- e7e5898: use-assistant: fix missing message content

## 3.0.29

### Patch Changes

- 22a737e: Fix: mark useAssistant as in progress for append/submitMessage.

## 3.0.28

### Patch Changes

- d6431ae: ai/core: add logprobs support (thanks @SamStenner for the contribution)
- 25f3350: ai/core: add support for getting raw response headers.
- Updated dependencies [d6431ae]
- Updated dependencies [25f3350]
  - @ai-sdk/provider@0.0.2
  - @ai-sdk/provider-utils@0.0.3

## 3.0.27

### Patch Changes

- eb150a6: ai/core: remove scaling of setting values (breaking change). If you were using the temperature, frequency penalty, or presence penalty settings, you need to update the providers and adjust the setting values.
- Updated dependencies [eb150a6]
  - @ai-sdk/provider-utils@0.0.2
  - @ai-sdk/provider@0.0.1

## 3.0.26

### Patch Changes

- f90f6a1: ai/core: add pipeAIStreamToResponse() to streamText result.

## 3.0.25

### Patch Changes

- 1e84d6d: Fix: remove mistral lib type dependency.
- 9c2a049: Add append() helper to useAssistant.

## 3.0.24

### Patch Changes

- e94fb32: feat(ai/rsc): Make `onSetAIState` and `onGetUIState` stable

## 3.0.23

### Patch Changes

- 66b5892: Add streamMode parameter to useChat and useCompletion.
- Updated dependencies [7b8791d]
  - @ai-sdk/provider-utils@0.0.1

## 3.0.22

### Patch Changes

- d544886: Breaking change: extract experimental AI core provider packages. They can now be imported with e.g. import { openai } from '@ai-sdk/openai' after adding them to a project.
- ea6b0e1: Expose formatStreamPart, parseStreamPart, and readDataStream helpers.

## 3.0.21

### Patch Changes

- 87d3db5: Extracted @ai-sdk/provider package
- 8c40f8c: ai/core: Fix openai provider streamObject for gpt-4-turbo
- 5cd29bd: ai/core: add toTextStreamResponse() method to streamText result

## 3.0.20

### Patch Changes

- f42bbb5: Remove experimental from useAssistant and AssistantResponse.
- 149fe26: Deprecate <Tokens/>
- 2eb4b55: Remove experimental\_ prefix from StreamData.
- e45fa96: Add stream support for Bedrock/Cohere.
- a6b2500: Deprecated the `experimental_streamData: true` setting from AIStreamCallbacksAndOptions. You can delete occurrences in your code. The stream data protocol is now used by default.

## 3.0.19

### Patch Changes

- 4f4c7f5: ai/core: Anthropic tool call support

## 3.0.18

### Patch Changes

- 63d587e: Add Anthropic provider for ai/core functions (no tool calling).
- 63d587e: Add automatic mime type detection for images in ai/core prompts.

## 3.0.17

### Patch Changes

- 2b991c4: Add Google Generative AI provider for ai/core functions.

## 3.0.16

### Patch Changes

- a54ea77: feat(ai/rsc): add `useStreamableValue`

## 3.0.15

### Patch Changes

- 4aed2a5: Add JSDoc comments for ai/core functions.
- cf8d12f: Export experimental language model specification under `ai/spec`.

## 3.0.14

### Patch Changes

- 8088de8: fix(ai/rsc): improve typings for `StreamableValue`
- 20007b9: feat(ai/rsc): support string diff and patch in streamable value
- 6039460: Support Bedrock Anthropic Stream for Messages API.
- e83bfe3: Added experimental ai/core functions (streamText, generateText, streamObject, generateObject). Add OpenAI and Mistral language model providers.

## 3.0.13

### Patch Changes

- 026d061: Expose setMessages in useAssistant hook
- 42209be: AssistantResponse: specify forwardStream return type.

## 3.0.12

### Patch Changes

- b99b008: fix(ai/rsc): avoid appending boundary if the same reference was passed

## 3.0.11

### Patch Changes

- ce009e2: Added OpenAI assistants streaming.
- 3f9bf3e: Updates types to OpenAI SDK 4.29.0

## 3.0.10

### Patch Changes

- 33d261a: fix(ai/rsc): Fix .append() behavior

## 3.0.9

### Patch Changes

- 81ca3d6: fix(ai/rsc): improve .done() argument type

## 3.0.8

### Patch Changes

- a94aab2: ai/rsc: optimize streamable value stream size

## 3.0.7

### Patch Changes

- 9a9ae73: feat(ai/rsc): readStreamableValue

## 3.0.6

### Patch Changes

- 1355ad0: Fix: experimental_onToolCall is called with parsed tool args
- 9348f06: ai/rsc: improve dev error and warnings by trying to detect hanging streams
- 8be9404: fix type resolution

## 3.0.5

### Patch Changes

- a973f1e: Support Anthropic SDK v0.15.0
- e25f3ca: type improvements

## 3.0.4

### Patch Changes

- 7962862: fix `useActions` type inference
- aab5324: Revert "fix(render): parse the args based on the zod schema"
- fe55612: Bump OpenAI dependency to 4.28.4; fix type error in render

## 3.0.3

### Patch Changes

- 4d816ca: fix(render): parse the args based on the zod schema
- d158a47: fix potential race conditions

## 3.0.2

### Patch Changes

- 73bd06e: fix(useActions): return typed object

## 3.0.1

### Patch Changes

- ac20a25: ai/rsc: fix text response and async generator
- b88778f: Added onText callback for text tokens.

## 3.0.0

### Major Changes

- 51054a9: add ai/rsc

## 2.2.37

### Patch Changes

- a6b5764: Add support for Mistral's JavaScript SDK

## 2.2.36

### Patch Changes

- 141f0ce: Fix: onFinal callback is invoked with text from onToolCall when onToolCall returns string

## 2.2.35

### Patch Changes

- b717dad: Adding Inkeep as a stream provider

## 2.2.34

### Patch Changes

- 2c8ffdb: cohere-stream: support AsyncIterable
- ed1e278: Message annotations handling for all Message types

## 2.2.33

### Patch Changes

- 8542ae7: react/use-assistant: add onError handler
- 97039ff: OpenAIStream: Add support for the Azure OpenAI client library

## 2.2.32

### Patch Changes

- 7851fa0: StreamData: add `annotations` and `appendMessageAnnotation` support

## 2.2.31

### Patch Changes

- 9b89c4d: react/use-assistant: Expose setInput
- 75751c9: ai/react: Add experimental_onToolCall to useChat.

## 2.2.30

### Patch Changes

- ac503e0: ai/solid: add chat request options to useChat
- b78a73e: Add GoogleGenerativeAIStream for Gemini support
- 5220336: ai/svelte: Add experimental_onToolCall to useChat.
- ef99062: Add support for the Anthropic message API
- 5220336: Add experimental_onToolCall to OpenAIStream.
- ac503e0: ai/vue: add chat request options to useChat

## 2.2.29

### Patch Changes

- 5a9ae2e: ai/prompt: add `experimental_buildOpenAIMessages` to validate and cast AI SDK messages to OpenAI messages

## 2.2.28

### Patch Changes

- 07a679c: Add data message support to useAssistant & assistantResponse.
- fbae595: ai/react: `api` functions are no longer used as a cache key in `useChat`

## 2.2.27

### Patch Changes

- 0fd1205: ai/vue: Add complex response parsing and StreamData support to useCompletion
- a7dc746: experimental_useAssistant: Expose extra fetch options
- 3dcf01e: ai/react Add data support to useCompletion
- 0c3b338: ai/svelte: Add complex response parsing and StreamData support to useCompletion
- 8284777: ai/solid: Add complex response parsing and StreamData support to useCompletion

## 2.2.26

### Patch Changes

- df1ad33: ai/vue: Add complex response parsing and StreamData support to useChat
- 3ff8a56: Add `generateId` to use-chat params to allow overriding message ID generation
- 6c2a49c: ai/react experimental_useAssistant() submit can be called without an event
- 8b4f7d1: ai/react: Add complex response parsing and StreamData support to useCompletion

## 2.2.25

### Patch Changes

- 1e61c69: chore: specify the minimum react version to 18
- 6aec2d2: Expose threadId in useAssistant
- c2369df: Add AWS Bedrock support
- 223fde3: ai/svelte: Add complex response parsing and StreamData support to useChat

## 2.2.24

### Patch Changes

- 69ca8f5: ai/react: add experimental_useAssistant hook and experimental_AssistantResponse
- 3e2299e: experimental_StreamData/StreamingReactResponse: optimize parsing, improve types
- 70bd2ac: ai/solid: add experimental_StreamData support to useChat

## 2.2.23

### Patch Changes

- 5a04321: add StreamData support to StreamingReactResponse, add client-side data API to react/use-chat

## 2.2.22

### Patch Changes

- 4529831: ai/react: Do not store initialMessages in useState
- db5378c: experimental_StreamData: fix data type to be JSONValue

## 2.2.21

### Patch Changes

- 2c8d4bd: Support openai@4.16.0 and later

## 2.2.20

### Patch Changes

- 424d5ee: experimental_StreamData: fix trailing newline parsing bug in decoder
- c364c6a: cohere: fix closing cohere stream, avoids response from hanging

## 2.2.19

### Patch Changes

- 699552d: add experimental_StreamingReactResponse

## 2.2.18

### Patch Changes

- 0bd27f6: react/use-chat: allow client-side handling of function call without following response

## 2.2.17

### Patch Changes

- 5ed581d: Use interface instead of type for Message to allow declaration merging
- 9adec1e: vue and solid: fix including `function_call` and `name` fields in subsequent requests

## 2.2.16

### Patch Changes

- e569688: Fix for #637, resync interfaces

## 2.2.15

### Patch Changes

- c5d1857: fix: return complete response in onFinish when onCompletion isn't passed
- c5d1857: replicate-stream: fix types for replicate@0.20.0+

## 2.2.14

### Patch Changes

- 6229d6b: openai: fix OpenAIStream types with openai@4.11+

## 2.2.13

### Patch Changes

- a4a997f: all providers: reset error message on (re)submission

## 2.2.12

### Patch Changes

- cb181b4: ai/vue: wrap body with unref to support reactivity

## 2.2.11

### Patch Changes

- 2470658: ai/react: fix: handle partial chunks in react getStreamedResponse when using experimental_StreamData

## 2.2.10

### Patch Changes

- 8a2cbaf: vue/use-completion: fix: don't send network request for loading state"
- bbf4403: langchain-stream: return langchain `writer` from LangChainStream

## 2.2.9

### Patch Changes

- 3fc2b32: ai/vue: fix: make body parameter reactive

## 2.2.8

### Patch Changes

- 26bf998: ai/react: make reload/complete/append functions stable via useCallback

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
