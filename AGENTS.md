# AI SDK Agent Corrections

This document outlines common mistakes when using the Vercel AI SDK and their corrections. 
It is intended to be used by AI coding assistants to help them use the SDK correctly.

| AI Uses                                          | Correction                               |
| ------------------------------------------------ | ---------------------------------------- |
| `maxTokens`                                      | `maxOutputTokens`                        |
| `maxSteps`                                       | `stopWhen`                               |
| `parameters` (in tool definition)                | `inputSchema`                            |
| `generateObject`                                 | `generateText` with `output`             |
| `generateText` with JSON instructions + parsing  | `generateText` with `output`             |