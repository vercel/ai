# Streaming Data Flow Architecture

This document describes how streaming data moves through the AI SDK, from the provider's HTTP response to the UI component rendering in the browser. It covers both the backend pipeline (`streamText` and its internal transforms) and the frontend consumption path (`useChat`, `useCompletion`).

## End-to-End Overview

```mermaid
flowchart LR
    subgraph Provider["AI Provider (e.g. OpenAI)"]
        API["HTTP SSE / chunked response"]
    end

    subgraph Core["AI SDK Core (server)"]
        LM["LanguageModelV4.doStream()"]
        MW["Middleware pipeline"]
        ST["streamText()"]
        TP["Part transform stream"]
        DR["DataStreamResponse"]
    end

    subgraph Transport["HTTP Transport"]
        HTTP["Chunked HTTP response"]
    end

    subgraph UI["AI SDK UI (browser)"]
        UC["useChat / useCompletion"]
        PS["Stream parser"]
        State["React / Vue / Svelte state"]
        Render["Rendered UI"]
    end

    API -->|raw chunks| LM
    LM -->|LanguageModelV4StreamPart| MW
    MW -->|transformed parts| ST
    ST -->|internal stream| TP
    TP -->|formatted parts| DR
    DR -->|data stream protocol| HTTP
    HTTP -->|SSE chunks| PS
    PS -->|parsed parts| UC
    UC -->|state updates| State
    State --> Render
```

## Provider to Core

When `streamText()` is called, it resolves the model reference to a `LanguageModelV4` implementation (e.g. `OpenAIChatLanguageModel`). The model's `doStream()` method opens an HTTP connection to the provider API and returns a `ReadableStream<LanguageModelV4StreamPart>`.

Stream part types include:

- `text-start` / `text-delta` / `text-end` — incremental text generation
- `tool-call-start` / `tool-call-delta` / `tool-call-end` — tool invocations
- `reasoning` — model reasoning content
- `source` — source attribution
- `finish` / `error` — terminal events

```mermaid
sequenceDiagram
    participant App as Application Code
    participant ST as streamText()
    participant MW as Middleware
    participant Model as LanguageModelV4
    participant API as Provider API

    App->>ST: streamText({ model, prompt })
    ST->>MW: doStream(params)
    MW->>MW: transformParams()
    MW->>Model: doStream(transformedParams)
    Model->>API: HTTP POST (streaming)
    API-->>Model: SSE chunks
    Model-->>MW: LanguageModelV4StreamPart stream
    MW-->>MW: wrapStream transform
    MW-->>ST: transformed stream
    ST-->>App: StreamTextResult
```

## Middleware Pipeline

Middleware wraps the model using `wrapLanguageModel()`. When multiple middlewares are provided, they are applied in reverse order so the first middleware in the array is the outermost wrapper.

For a call with `[middlewareA, middlewareB]`:

```mermaid
flowchart TB
    subgraph Execution Order
        direction TB
        Call["streamText() call"]
        A_transform["middlewareA.transformParams()"]
        B_transform["middlewareB.transformParams()"]
        Model["model.doStream()"]
        B_wrap["middlewareB.wrapStream()"]
        A_wrap["middlewareA.wrapStream()"]
        Result["StreamTextResult"]

        Call --> A_transform
        A_transform --> B_transform
        B_transform --> Model
        Model --> B_wrap
        B_wrap --> A_wrap
        A_wrap --> Result
    end
```

Each middleware can intercept at three points:

| Hook | Phase | Use Case |
|------|-------|----------|
| `transformParams` | Before model call | RAG injection, prompt rewriting |
| `wrapGenerate` | Around `doGenerate` | Caching, guardrails, logging |
| `wrapStream` | Around `doStream` | Stream transformation, logging |

## Core to UI

The `streamText()` result provides multiple consumption methods:

```mermaid
flowchart LR
    ST["StreamTextResult"]

    ST -->|".textStream"| TS["AsyncIterable<string>"]
    ST -->|".fullStream"| FS["AsyncIterable<StreamPart>"]
    ST -->|".toDataStreamResponse()"| DSR["Data Stream HTTP Response"]
    ST -->|".toTextStreamResponse()"| TSR["Text Stream HTTP Response"]
    ST -->|".pipeDataStreamToResponse(res)"| Pipe["Pipe to Node response"]

    DSR --> Browser["Browser fetch()"]
    TSR --> Browser
    Pipe --> Browser
```

### Data Stream Protocol

The data stream protocol encodes typed parts as newline-delimited messages. Each line has a type prefix followed by the payload. This allows the frontend to distinguish between text chunks, tool calls, errors, and metadata without ambiguity.

### Frontend Parsing

On the frontend, `useChat` and `useCompletion` open a fetch request and parse the incoming stream using the appropriate protocol parser. Parsed parts update the hook's internal state, which triggers re-renders:

```mermaid
flowchart TB
    subgraph Frontend Hook
        Fetch["fetch() with streaming"]
        Parse["Protocol parser"]
        MsgState["messages[] state"]
        Parts["message.parts[]"]

        Fetch -->|ReadableStream| Parse
        Parse -->|text part| MsgState
        Parse -->|tool-call part| MsgState
        Parse -->|tool-result part| MsgState
        MsgState --> Parts
    end

    Parts --> TextPart["{ type: 'text', text }"]
    Parts --> ToolPart["{ type: 'tool-invocation', ... }"]
    Parts --> ReasonPart["{ type: 'reasoning', ... }"]
```

## Tool Call Round-Trip

When the model produces a tool call, the SDK can execute it server-side and feed the result back into the model for another generation round. This loop continues until the model produces a final text response or hits the `maxSteps` limit.

```mermaid
sequenceDiagram
    participant ST as streamText
    participant Model as LanguageModelV4
    participant Tool as Tool executor

    ST->>Model: doStream(prompt)
    Model-->>ST: tool-call stream parts
    ST->>Tool: execute(toolName, args)
    Tool-->>ST: tool result
    ST->>Model: doStream(prompt + tool result)
    Model-->>ST: text stream parts
    ST-->>ST: emit final result
```
