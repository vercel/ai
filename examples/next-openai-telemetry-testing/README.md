# AI SDK Telemetry Testing Example

This example demonstrates how to implement and test telemetry in an AI SDK application using OpenTelemetry. It shows:

- Custom metrics for AI operations
- Tracing with spans
- Unit testing telemetry implementation
- Error handling and monitoring

## Features

- **Custom Metrics**
  - Completion counter
  - Latency histogram
  - Token usage tracking
  - Error rate monitoring

- **Tracing**
  - Operation spans
  - Error tracking
  - Context propagation

- **Testing**
  - Metric recording verification
  - Mock telemetry providers
  - Error handling tests

## Getting Started

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
# Add your OpenAI API key
```

3. Run the development server:
```bash
pnpm dev
```

4. Run tests:
```bash
pnpm test
```

## Telemetry Implementation

The example uses OpenTelemetry to track:

1. **Metrics**
   - `ai_completions_total`: Counter for completion requests
   - `ai_completion_latency`: Histogram for completion latency
   - `ai_completion_tokens`: Histogram for token usage

2. **Traces**
   - API route spans
   - AI completion spans
   - Error spans

## Testing

The example includes tests for:

1. **Metric Recording**
   - Success metrics
   - Error metrics
   - Token usage

2. **API Integration**
   - Success cases
   - Error handling
   - Metric verification

## Learn More

- [AI SDK Telemetry Documentation](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Next.js Documentation](https://nextjs.org/docs) 