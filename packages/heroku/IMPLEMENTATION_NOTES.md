# Implementation Notes

## Overview

This Heroku embeddings package follows the established patterns used throughout the Vercel AI SDK packages. It provides a clean, type-safe interface for generating text embeddings using Heroku's AI endpoint.

## Architecture

### Core Components

1. **HerokuEmbeddingModel** - Main embedding model class implementing `EmbeddingModelV2<string>`
2. **HerokuProvider** - Provider factory and configuration management
3. **HerokuEmbeddingOptions** - Type-safe options schema using Zod
4. **Error Handling** - Consistent error response handling
5. **Testing** - Comprehensive test coverage using the established testing patterns

### Design Patterns

#### 1. Interface Implementation
The package implements the `EmbeddingModelV2<string>` interface, ensuring compatibility with the AI SDK core:

```typescript
export class HerokuEmbeddingModel implements EmbeddingModelV2<string> {
  readonly specificationVersion = 'v2';
  readonly maxEmbeddingsPerCall = 2048;
  readonly supportsParallelCalls = true;
  // ... implementation
}
```

#### 2. Provider Pattern
Follows the established provider pattern used by other packages:

```typescript
export interface HerokuProvider extends ProviderV2 {
  embedding(modelId: HerokuEmbeddingModelId): EmbeddingModelV2<string>;
  textEmbeddingModel(modelId: HerokuEmbeddingModelId): EmbeddingModelV2<string>;
}
```

#### 3. Configuration Management
Uses the same configuration pattern with environment variable fallbacks:

```typescript
const getHeaders = () => ({
  Authorization: `Bearer ${loadApiKey({
    apiKey: options.apiKey,
    environmentVariableName: 'HEROKU_API_KEY',
    description: 'Heroku',
  })}`,
  // ... other headers
});
```

#### 4. Error Handling
Consistent error handling using the provider-utils error handlers:

```typescript
export const herokuFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: herokuErrorDataSchema,
  errorToMessage: data => data.error.message,
});
```

#### 5. Testing Strategy
Comprehensive testing following the established patterns:

- Unit tests for all public methods
- Mock server testing for API interactions
- Edge runtime compatibility testing
- Error scenario coverage
- Configuration testing

## API Design Decisions

### Model IDs
The package includes common Cohere model IDs that are likely available through Heroku's AI endpoint:

- `cohere-embed-multilingual-v3.0` - Multilingual embeddings
- `cohere-embed-english-v3.0` - English-only embeddings
- `cohere-embed-english-light-v3.0` - Lightweight English embeddings
- `cohere-embed-multilingual-light-v3.0` - Lightweight multilingual embeddings

### Embedding Options
Supports common embedding options that are standard across embedding APIs:

- `inputType` - Specifies the type of input (search_document, search_query, etc.)
- `truncate` - How to handle long inputs
- `dimensions` - Custom embedding dimensions
- `user` - User identifier for abuse monitoring

### Response Schema
Follows the OpenAI-compatible response format that's common across embedding APIs:

```typescript
{
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}
```

## Assumptions Made

Since the exact Heroku API documentation wasn't available, the implementation makes these reasonable assumptions:

1. **API Endpoint**: Uses `/embeddings` endpoint following common patterns
2. **Authentication**: Bearer token authentication via Authorization header
3. **Request Format**: OpenAI-compatible request format
4. **Response Format**: OpenAI-compatible response format
5. **Error Handling**: Standard JSON error response format

## Customization Points

The implementation is designed to be easily customizable once the actual Heroku API documentation is available:

1. **Base URL**: Configurable via `baseURL` option
2. **Model IDs**: Extensible model ID type
3. **Request Format**: Modifiable request body structure
4. **Response Parsing**: Adjustable response schema
5. **Error Handling**: Customizable error response handling

## Testing Coverage

The test suite covers:

- ✅ Basic embedding functionality
- ✅ Response parsing and extraction
- ✅ Error handling scenarios
- ✅ Configuration options
- ✅ Header management
- ✅ Provider factory functions
- ✅ Model property validation
- ✅ Edge cases (abort signals, empty responses)
- ✅ Input validation

## Future Enhancements

Once the actual Heroku API documentation is available, consider:

1. **Rate Limiting**: Add rate limiting support
2. **Retry Logic**: Implement retry mechanisms for transient failures
3. **Streaming**: Add support for streaming embeddings if available
4. **Batch Processing**: Optimize for large batch operations
5. **Caching**: Add embedding result caching
6. **Metrics**: Add telemetry and monitoring support

## Integration Notes

This package integrates seamlessly with the Vercel AI SDK:

```typescript
import { embed } from 'ai';
import { heroku } from '@ai-sdk/heroku';

const model = heroku.embedding('cohere-embed-multilingual-v3.0');

const result = await embed({
  model,
  value: 'Hello world',
});
```

## Performance Considerations

- **Parallel Processing**: Supports parallel embedding calls
- **Batch Size**: Optimized for up to 2048 embeddings per call
- **Memory Usage**: Efficient memory usage with streaming responses
- **Network**: Minimal network overhead with optimized request/response handling
