# AI SDK Agent Corrections

This document outlines common mistakes when using the Vercel AI SDK and their corrections.
It is intended to be used by AI coding assistants to help them use the SDK correctly.

## Core Corrections

| AI Uses                                         | Correction                           |
| ----------------------------------------------- | ------------------------------------ |
| `maxTokens`                                     | `maxOutputTokens`                    |
| `maxSteps`                                      | `stopWhen`                           |
| `parameters` (in tool definition)               | `inputSchema`                        |
| `args` (in tool call)                           | `input`                              |
| `result` (in tool result)                       | `output`                             |
| `experimental_toToolResultContent`              | `toModelOutput`                      |
| `generateObject`                                | `generateText` with `output` setting |
| `streamObject`                                  | `streamText` with `output` setting   |
| `generateText` with JSON instructions + parsing | `generateText` with `output` setting |
| `CoreMessage`                                   | `ModelMessage`                       |
| `convertToCoreMessages`                         | `convertToModelMessages` (now async) |
| `Experimental_Agent`                            | `ToolLoopAgent`                      |
| `providerMetadata` (in input)                   | `providerOptions`                    |
| `textEmbedding` / `textEmbeddingModel`          | `embedding` / `embeddingModel`       |

## UI Corrections (useChat / useCompletion)

| AI Uses                   | Correction                             |
| ------------------------- | -------------------------------------- |
| `Message`                 | `UIMessage`                            |
| `append`                  | `sendMessage`                          |
| `reload`                  | `regenerate`                           |
| `isLoading`               | `status`                               |
| `maxSteps` (in `useChat`) | Use server-side `stopWhen`             |
| `onResponse`              | Removed (use `onFinish` or middleware) |

For more information, see the [AI SDK Documentation](https://sdk.vercel.ai/docs).
