# @ai-sdk/heroku

Heroku AI embeddings provider for the Vercel AI SDK.

## Installation

```bash
npm install @ai-sdk/heroku
```

## Setup

Set your Heroku API key as an environment variable:

```bash
export HEROKU_API_KEY="your-heroku-api-key"
```

## Usage

### Basic Usage

```typescript
import { heroku } from '@ai-sdk/heroku';

const model = heroku.embedding('cohere-embed-multilingual-v3.0');

const { embeddings } = await model.doEmbed({
  values: ['Hello world', 'How are you?']
});

console.log(embeddings);
// Output: [[0.1, 0.2, ...], [0.3, 0.4, ...]]
```

### Custom Provider Configuration

```typescript
import { createHeroku } from '@ai-sdk/heroku';

const herokuProvider = createHeroku({
  apiKey: 'your-api-key',
  baseURL: 'https://custom-heroku-api.com/v1',
  headers: {
    'X-Custom-Header': 'custom-value'
  }
});

const model = herokuProvider.embedding('cohere-embed-multilingual-v3.0');
```

### With Provider Options

```typescript
const { embeddings } = await model.doEmbed({
  values: ['Hello world'],
  providerOptions: {
    heroku: {
      inputType: 'search_document',
      truncate: 'END',
      dimensions: 1024,
      user: 'user-123'
    }
  }
});
```

## Available Models

- `cohere-embed-multilingual-v3.0` - Multilingual embeddings (recommended)
- `cohere-embed-english-v3.0` - English-only embeddings
- `cohere-embed-english-light-v3.0` - Lightweight English embeddings
- `cohere-embed-multilingual-light-v3.0` - Lightweight multilingual embeddings

## API Reference

### `createHeroku(options?)`

Creates a new Heroku provider instance.

#### Options

- `apiKey?: string` - Your Heroku API key (defaults to `HEROKU_API_KEY` env var)
- `baseURL?: string` - Custom API base URL (defaults to `https://api.heroku.com/v1`)
- `headers?: Record<string, string>` - Additional headers to include in requests
- `fetch?: FetchFunction` - Custom fetch implementation
- `generateId?: () => string` - Custom ID generator function

### `heroku.embedding(modelId)`

Creates an embedding model instance.

#### Parameters

- `modelId: string` - The model ID to use

#### Returns

An `EmbeddingModelV2<string>` instance.

### `model.doEmbed(options)`

Generates embeddings for the provided text values.

#### Parameters

- `values: string[]` - Array of text strings to embed
- `abortSignal?: AbortSignal` - Optional abort signal
- `headers?: Record<string, string>` - Additional request headers
- `providerOptions?: { heroku?: HerokuEmbeddingOptions }` - Provider-specific options

#### Returns

```typescript
{
  embeddings: number[][];
  usage?: { tokens: number };
  response: { headers: Record<string, string>; body: unknown };
}
```

### HerokuEmbeddingOptions

- `inputType?: 'search_document' | 'search_query' | 'classification' | 'clustering'` - Type of input (default: 'search_query')
- `truncate?: 'NONE' | 'START' | 'END'` - How to handle long inputs (default: 'END')
- `dimensions?: number` - Custom embedding dimensions
- `user?: string` - User identifier for abuse monitoring

## Error Handling

The package includes comprehensive error handling for common API errors:

- Rate limiting
- Authentication errors
- Invalid model IDs
- Input validation errors
- Network errors

## Testing

```bash
npm test
```

## License

Apache-2.0
