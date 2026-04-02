# Middleware Pipeline Architecture

This document details how language model middleware works internally, covering the wrapping mechanism, execution order, and composition patterns.

## Wrapping Mechanism

`wrapLanguageModel()` takes a model and one or more middlewares, returning a new `LanguageModelV4` that intercepts `doGenerate` and `doStream` calls.

```mermaid
classDiagram
    class LanguageModelV4 {
        <<interface>>
        +provider: string
        +modelId: string
        +doGenerate(params) GenerateResult
        +doStream(params) StreamResult
    }

    class WrappedModel {
        -innerModel: LanguageModelV4
        -middleware: LanguageModelV4Middleware
        +doGenerate(params) GenerateResult
        +doStream(params) StreamResult
    }

    class LanguageModelV4Middleware {
        <<interface>>
        +transformParams(ctx)
        +wrapGenerate(ctx)
        +wrapStream(ctx)
    }

    class ConcreteProvider {
        +doGenerate(params)
        +doStream(params)
    }

    WrappedModel ..|> LanguageModelV4 : implements
    WrappedModel --> LanguageModelV4 : wraps inner model
    WrappedModel --> LanguageModelV4Middleware : uses
    ConcreteProvider ..|> LanguageModelV4 : implements
```

The wrapped model satisfies the same `LanguageModelV4` interface, so it can be used anywhere a model is expected — including as input to another `wrapLanguageModel()` call.

## Composition and Execution Order

When an array of middlewares `[A, B, C]` is provided, the SDK reverses the array and reduces from the innermost wrapper outward:

```
wrapLanguageModel({ model, middleware: [A, B, C] })

// Internally becomes:
A( B( C( model ) ) )
```

This means:

- **Parameter transforms** execute outside-in: A first, then B, then C
- **Stream/generate wrappers** execute outside-in for the "before" phase: A wraps B wraps C wraps model
- **Results** flow back inside-out: model result passes through C, then B, then A

```mermaid
flowchart TB
    subgraph "Request Phase (outside → in)"
        direction TB
        R1["A.transformParams()"] --> R2["B.transformParams()"] --> R3["C.transformParams()"]
    end

    subgraph "Model Call"
        direction TB
        R3 --> M["model.doStream()"]
    end

    subgraph "Response Phase (inside → out)"
        direction TB
        M --> S3["C.wrapStream()"]
        S3 --> S2["B.wrapStream()"]
        S2 --> S1["A.wrapStream()"]
    end

    S1 --> Result["Final StreamResult"]
```

## Internal Call Flow

For each `doGenerate` or `doStream` call on a wrapped model:

```mermaid
flowchart TD
    Entry["wrappedModel.doGenerate(params)"]

    Entry --> TP["transformParams(params, type='generate')"]
    TP -->|transformed params| Decision{wrapGenerate defined?}

    Decision -->|Yes| WG["wrapGenerate({ doGenerate, doStream, params, model })"]
    Decision -->|No| DG["model.doGenerate(transformedParams)"]

    WG -->|middleware calls doGenerate| DG
    DG --> Result["GenerateResult"]
    WG --> Result
```

The `wrapGenerate` and `wrapStream` callbacks receive both `doGenerate` and `doStream` functions, allowing a stream wrapper to fall back to non-streaming generation (or vice versa) if needed.

## Middleware Hook Reference

| Hook | Signature | Called During | Typical Uses |
|------|-----------|--------------|-------------|
| `transformParams` | `(ctx: { params, type, model }) => params` | Both generate and stream | Inject RAG context, rewrite prompts, add system instructions |
| `wrapGenerate` | `(ctx: { doGenerate, doStream, params, model }) => result` | `doGenerate` only | Caching responses, applying guardrails, logging |
| `wrapStream` | `(ctx: { doGenerate, doStream, params, model }) => result` | `doStream` only | Stream transforms, token counting, rate monitoring |
| `overrideProvider` | `(ctx: { model }) => string` | Model construction | Dynamic provider routing |
| `overrideModelId` | `(ctx: { model }) => string` | Model construction | Model aliasing, A/B testing |
| `overrideSupportedUrls` | `(ctx: { model }) => urls` | Model construction | URL allowlist overrides |

## Common Patterns

### Layered Middleware Stack

A typical production setup layers concerns:

```mermaid
flowchart LR
    subgraph "Middleware Stack"
        direction LR
        Log["Logging"] --> Guard["Guardrails"] --> Cache["Caching"] --> RAG["RAG"] --> Model["Base Model"]
    end

    App["streamText()"] --> Log
    Model --> Provider["Provider API"]
```

Each middleware handles one concern. The logging middleware records inputs and outputs. The guardrail middleware validates content. The caching middleware short-circuits repeated queries. The RAG middleware injects retrieved context into the prompt.

### Stream Transformation

Middleware can modify stream content by piping through a `TransformStream`:

```mermaid
flowchart LR
    Original["Original stream"] --> Transform["TransformStream"]
    Transform --> Modified["Modified stream"]

    subgraph TransformStream
        direction TB
        Inspect["Inspect each chunk"]
        Modify["Modify / filter / augment"]
        Enqueue["Enqueue to output"]

        Inspect --> Modify --> Enqueue
    end
```

The `wrapStream` hook receives the original stream and can return a new stream that pipes through any number of transforms. This is how built-in middlewares like `extractReasoningMiddleware` parse reasoning tags from the text stream and re-emit them as structured reasoning parts.
