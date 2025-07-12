# Retry Strategy

The Vercel AI SDK provides advanced retry capabilities for handling transient errors and rate limits when calling AI models.

## Basic Usage

By default, the SDK retries failed requests up to 2 times with exponential backoff:

```typescript
import { generateText } from 'ai';

const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Hello, world!',
  maxRetries: 3, // Override default of 2
});
```

## Custom Retry Strategy

You can customize retry behavior using the `retryStrategy` parameter:

```typescript
import { generateText, RetryStrategy } from 'ai';

const retryStrategy: RetryStrategy = {
  // Automatically respect rate limit headers
  respectRateLimitHeaders: true,
  
  // Custom retry delay function
  retryDelay: (attempt, error) => {
    // Implement custom backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
    const jitter = Math.random() * 0.1 * baseDelay;
    return baseDelay + jitter;
  },
};

const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Hello, world!',
  maxRetries: 5,
  retryStrategy,
});
```

## Rate Limit Header Support

The SDK automatically parses and respects rate limit headers from major providers when `respectRateLimitHeaders` is enabled:

### Supported Headers

- **Anthropic**: `anthropic-ratelimit-*-reset` (RFC 3339 format)
  - `anthropic-ratelimit-input-tokens-reset`
  - `anthropic-ratelimit-output-tokens-reset`
  - `anthropic-ratelimit-requests-reset`

- **OpenAI**: `x-ratelimit-reset-*` (Unix timestamp)
  - `x-ratelimit-reset-requests`
  - `x-ratelimit-reset-tokens`
  - `x-ratelimit-reset`

- **Standard**: `retry-after` (seconds or HTTP date)

### Example: Respecting Rate Limits

```typescript
const result = await generateText({
  model: anthropic('claude-3-opus'),
  prompt: 'Complex analysis request',
  maxRetries: 3,
  retryStrategy: {
    respectRateLimitHeaders: true, // Wait until rate limit reset time
  },
});
```

## Advanced Examples

### Custom Retry Logic Based on Error Type

```typescript
const retryStrategy: RetryStrategy = {
  retryDelay: (attempt, error) => {
    // Check if it's a rate limit error
    if (error?.statusCode === 429) {
      // Check for rate limit headers
      const resetTime = error.responseHeaders?.['x-ratelimit-reset'];
      if (resetTime) {
        const resetMs = parseInt(resetTime) * 1000;
        return Math.max(0, resetMs - Date.now());
      }
    }
    
    // Default exponential backoff for other errors
    return Math.min(1000 * Math.pow(2, attempt), 30000);
  },
};
```

### Linear Backoff with Jitter

```typescript
const retryStrategy: RetryStrategy = {
  retryDelay: (attempt) => {
    // Linear backoff: 1s, 2s, 3s, etc.
    const baseDelay = attempt * 1000;
    // Add 10-20% jitter
    const jitter = baseDelay * (0.1 + Math.random() * 0.1);
    return baseDelay + jitter;
  },
};
```

### Combining with Other AI SDK Functions

The retry strategy works with all AI SDK functions:

```typescript
// Stream text generation
const stream = await streamText({
  model: openai('gpt-4o'),
  prompt: 'Write a story',
  retryStrategy: {
    respectRateLimitHeaders: true,
  },
});

// Generate objects
const object = await generateObject({
  model: openai('gpt-4o'),
  schema: z.object({ name: z.string() }),
  prompt: 'Generate a person',
  retryStrategy: {
    respectRateLimitHeaders: true,
  },
});

// Embeddings
const embedding = await embed({
  model: openai.embedding('text-embedding-3-small'),
  value: 'Hello, world!',
  retryStrategy: {
    respectRateLimitHeaders: true,
  },
});
```

## Best Practices

1. **Enable Rate Limit Headers**: Always set `respectRateLimitHeaders: true` when working with production APIs to avoid hitting rate limits unnecessarily.

2. **Add Jitter**: Include random jitter in your retry delays to prevent thundering herd problems.

3. **Set Reasonable Limits**: Don't set `maxRetries` too high - if a request fails multiple times, it's often better to fail fast and handle the error appropriately.

4. **Monitor Retry Patterns**: Log retry attempts to understand failure patterns and adjust your strategy accordingly.

5. **Consider Circuit Breakers**: For production applications, consider implementing circuit breaker patterns on top of the retry strategy.

## TypeScript Types

```typescript
interface RetryStrategy {
  /**
   * Custom function to calculate retry delay in milliseconds.
   * @param attempt - The retry attempt number (1 for first retry, 2 for second, etc.)
   * @param error - The error that triggered the retry (if available)
   * @returns Delay in milliseconds before the next retry
   */
  retryDelay?: (attempt: number, error?: APICallError) => number;
  
  /**
   * Whether to automatically parse and respect rate limit headers.
   * When true, the SDK will wait until the rate limit reset time if provided.
   * Default: true
   */
  respectRateLimitHeaders?: boolean;
}
```