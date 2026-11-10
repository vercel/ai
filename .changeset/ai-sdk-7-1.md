---
"ai": minor
---

- [Harnesses and tools](#harnesses-and-tools)
- [Typed decisions](#typed-decisions)
- [Batch processing](#batch-processing)
- [Steering](#steering)
- [Realtime and streaming audio](#realtime-and-streaming-audio)
- [Code mode and tool search](#code-mode-and-tool-search)
- [Async video generation](#async-video-generation)
- [Agent and streaming controls](#agent-and-streaming-controls)
- [Durable workflow tracing](#durable-workflow-tracing)

## Harnesses and tools

New harness adapters connect `HarnessAgent` to Cline, Cursor, Deep Agents, fx, GitHub Copilot, and Grok Build. The Codex adapter now uses the app server and supports steering during a turn. `@ai-sdk/tool-bash` and `@ai-sdk/tool-web-fetch` add provider-independent tools for shell commands and web content. Learn more: [harness adapters](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters), [tools](https://ai-sdk.dev/docs/ai-sdk-core/tools).

## Typed decisions

`experimental_decide` answers typed choice, score, boolean, and bounding-box questions against shared text, JSON, or multimodal state. Native models can return probability distributions for choice and score answers. Use native decision providers or language-model adapters, with reasoning and token limits where supported. Learn more: [decisions](https://ai-sdk.dev/docs/ai-sdk-core/decisions).

## Batch processing

Submit text or image requests for background processing with `experimental_startBatch`. Retrieve status and results later, with cancellation, listing, and completion webhooks where supported. Text batches support tool definitions and per-request models; client tool execution stays with the application. Learn more: [batch processing](https://ai-sdk.dev/docs/ai-sdk-core/batch).

## Steering

Send corrections to a running agent with `experimental_createSteering()`. `steer()` adds a message at the next step boundary; `queue()` holds follow-ups until the current task finishes. Steering messages appear in UI streams and saved conversation history. Learn more: [steering](https://ai-sdk.dev/docs/agents/loop-control#steering).

## Realtime and streaming audio

`experimental_streamSpeech` turns text, including a `streamText` text stream, into audio as it arrives. `experimental_streamTranscribe` produces live transcripts; `experimental_streamTranslate` translates live speech into audio and text. Transcription also adds separate word timings and requests for word or segment timestamps.

Realtime adds continuous OpenAI Live sessions over WebSockets or browser WebRTC, server-owned connections, and provider-managed transports. A persistent WebSocket chat transport adds cancellation and sequence-based resume. Learn more: [realtime](https://ai-sdk.dev/docs/ai-sdk-core/realtime), [speech](https://ai-sdk.dev/docs/ai-sdk-core/speech#streaming-speech), [transcription](https://ai-sdk.dev/docs/ai-sdk-core/transcription#streaming-transcription), [translation](https://ai-sdk.dev/docs/ai-sdk-core/translation).

## Code mode and tool search

`@ai-sdk/code-mode` lets models write JavaScript or TypeScript to call tools in a QuickJS sandbox. Use `experimental_toolCallers` with `generateText`, `streamText`, or `ToolLoopAgent` to let models combine tool results and filter large responses before returning them to context.

`toolSearch()` discovers tools on demand. Mark tools with `deferLoading: true`, set a result limit, or supply custom search and ranking. With code mode, discovered definitions can travel in conversation messages while the provider's tool definition stays unchanged for prompt caching. Learn more: [code mode](https://ai-sdk.dev/docs/ai-sdk-core/code-mode), [tool search](https://ai-sdk.dev/docs/ai-sdk-core/tool-search).

## Async video generation

`experimental_startVideo` returns a serializable operation reference immediately. Check it later with `experimental_getVideoStatus`, or use completion webhooks where supported. Video generation also accepts first and last frame images and image or video references through `frameImages` and `inputReferences`. Learn more: [video generation](https://ai-sdk.dev/docs/ai-sdk-core/video-generation).

## Agent and streaming controls

Limit concurrent tool execution with `toolCallConcurrency`, including sequential execution with `1`. `prepareStep` can override model call settings per step. `onStepError` reports failed steps, and a first-content timeout catches streams that open but never produce content.

Opt into `streamRetries` to recover from provider failures during streaming while preserving completed steps. Already emitted partial output remains in the stream. For long streams, `experimental_streamTextLowMemory` avoids replay buffering and retained final content. Learn more: [tool concurrency](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-call-execution-concurrency), [loop control](https://ai-sdk.dev/docs/agents/loop-control), [streamText](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text).

## Durable workflow tracing

`WorkflowAgent.generate()` adds durable execution without streaming. With the durable OpenTelemetry bridge, a workflow run appears as one agent operation across suspension and resumption, with model and tool spans and their original timestamps. Learn more: [WorkflowAgent](https://ai-sdk.dev/docs/agents/workflow-agent), [durable tracing](https://ai-sdk.dev/docs/ai-sdk-core/telemetry#durable-workflowagent-runs).
