# @ai-sdk/heroku

Heroku AI embeddings provider for the Vercel AI SDK.

## Installation

```bash
npm install @ai-sdk/heroku
```

## Setup

Provision access to the `cohere-embedding-multilingual` model on your app `$APP_NAME`:

```bash
heroku ai:models:create -a $APP_NAME cohere-embed-multilingual --as EMBEDDING
```

Set Heroku environment variables:

```bash
export HEROKU_EMBEDDING_MODEL_ID=$(heroku config:get -a $APP_NAME EMBEDDING_MODEL_ID)
export HEROKU_EMBEDDING_KEY=$(heroku config:get -a $APP_NAME EMBEDDING_KEY)
export HEROKU_EMBEDDING_URL=$(heroku config:get -a $APP_NAME EMBEDDING_URL)
```

## Usage

### Basic Usage

```typescript
import { heroku } from '@ai-sdk/heroku';

const model = heroku.embedding(process.env.HEROKU_EMBEDDING_MODEL_ID);

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

const model = herokuProvider.embedding(process.env.HEROKU_EMBEDDING_MODEL_ID);
```

### With Provider Options

```typescript
const { embeddings } = await model.doEmbed({
  values: ['Hello world'],
  providerOptions: {
    heroku: {
      inputType: 'search_document',
      encodingFormat: 'base64',
      embeddingType: 'binary',
      allowIgnoredParams: true
    }
  }
});
```

## API Reference

### `createHeroku(options?)`

Creates a new Heroku provider instance.

#### Options

- `apiKey?: string` - Your Heroku API key (defaults to `HEROKU_API_KEY` env var)
- `baseURL?: string` - Custom API base URL (defaults to `https://api.heroku.com/v1`)
- `headers?: Record<string, string>` - Additional headers to include in requests
- `fetch?: FetchFunction` - Custom fetch implementation

### `heroku.embedding(modelId)`

Creates an embedding model instance.

#### Parameters

- `modelId: string` - The model ID to use. Currently, `cohere-embedding-multilingual` is the only supported model ID.

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

- `inputType?: 'search_document' | 'search_query' | 'classification' | 'clustering'` - Type of input (default: 'search_document')
- `encodingFormat?: 'raw' | 'base64'` - encoding format (default: 'raw')
- `embeddingType?: 'float' | 'int8' | 'uint8' | 'binary' | 'ubinary'` - Custom embedding type (default: 'float')
- `allowIgnoredParams?: boolean` - Specifies whether to ignore unsupported parameters in request instead of throwing an error. (default: false)

## Error Handling

The package includes comprehensive error handling for common API errors:

- Rate limiting
- Authentication errors
- Invalid model IDs
- Input validation errors
- Network errors

## Documentation

- https://devcenter.heroku.com/articles/heroku-inference-api-v1-embeddings
- https://devcenter.heroku.com/articles/heroku-inference-api-model-cohere-embed-multilingual