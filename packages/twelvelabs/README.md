# Twelve Labs Provider for Vercel AI SDK

The Twelve Labs provider for the Vercel AI SDK enables video understanding capabilities, including video analysis, search, and embeddings.

## Installation

```bash
npm install @ai-sdk/twelvelabs
```

## Setup

1. Sign up for a [Twelve Labs account](https://playground.twelvelabs.io/)
2. Get your API key from the [API Key page](https://playground.twelvelabs.io/dashboard/api-key)
3. Set the API key as an environment variable:

```bash
export TWELVELABS_API_KEY=your-api-key
```

The provider will automatically create indexes as needed:

- **Pegasus index** (`ai-sdk-pegasus`): For video generation/analysis with `pegasus1.2`
- **Marengo index** (`ai-sdk-marengo`): For video search and embeddings with `marengo2.7`

## Usage

### Video Analysis

Analyze videos using natural language prompts:

```typescript
import { twelvelabs } from '@ai-sdk/twelvelabs';
import { generateText } from 'ai';
import { readFile } from 'fs/promises';

// Analyze a video from URL
const result = await generateText({
  model: twelvelabs('pegasus1.2'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What happens in this video?' },
        {
          type: 'file',
          data: new URL('https://example.com/video.mp4'),
          mediaType: 'video/mp4',
        },
      ],
    },
  ],
});

// Analyze a local video file
const videoFile = await readFile('/path/to/video.mp4');
const localResult = await generateText({
  model: twelvelabs('pegasus1.2'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this video' },
        {
          type: 'file',
          data: videoFile, // Buffer/Uint8Array from file read
          mediaType: 'video/mp4',
        },
      ],
    },
  ],
});

// Get the video ID from the response for future use
console.log(result.providerMetadata?.twelvelabs?.videoId);

// Analyze an existing video by ID
const analysis = await generateText({
  model: twelvelabs('pegasus1.2'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe the main events in this video' },
        {
          type: 'file',
          data: 'placeholder', // Required by type but ignored when videoId is provided
          mediaType: 'video/mp4',
          providerOptions: {
            twelvelabs: {
              videoId: 'your-video-id',
            },
          },
        },
      ],
    },
  ],
});
```

### Video Search

Search across videos in your index:

```typescript
const searchResults = await generateText({
  model: twelvelabs('marengo2.7'),
  messages: [
    {
      role: 'user',
      content: 'Find moments where someone is playing basketball',
    },
  ],
});
```

Note: Search operates across all videos in your index without requiring a specific video.

### Embeddings

Create embeddings for text, images, and audio:

```typescript
import { embed } from 'ai';

const embedding = await embed({
  model: twelvelabs.textEmbedding('marengo2.7'),
  value: 'A person playing basketball',
});
```

### Streaming

Stream video analysis responses:

```typescript
import { streamText } from 'ai';

const stream = await streamText({
  model: twelvelabs('pegasus1.2'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Provide a detailed analysis of this video' },
        {
          type: 'file',
          data: new URL('https://example.com/video.mp4'),
          mediaType: 'video/mp4',
        },
      ],
    },
  ],
});

for await (const chunk of stream.textStream) {
  console.log(chunk);
}
```

## Configuration

### Automatic Index Management

The provider automatically creates and manages two separate indexes:

- **Pegasus index**: Used for video analysis/generation with `pegasus1.2`
- **Marengo index**: Used for video search and embeddings with `marengo2.7`

Each index is created automatically on first use with the appropriate model configuration.

### Custom Index Names

You can customize the index names (default: `ai-sdk-pegasus` and `ai-sdk-marengo`):

```typescript
// Via environment variables
export TWELVELABS_PEGASUS_INDEX_NAME=my-pegasus-index
export TWELVELABS_MARENGO_INDEX_NAME=my-marengo-index

// Via provider settings
const provider = createTwelveLabs({
  pegasusIndexName: 'my-generation-index',
  marengoIndexName: 'my-search-index',
});
```

### Provider Settings

```typescript
const provider = createTwelveLabs({
  apiKey: 'your-api-key', // Optional if set via environment
  pegasusIndexName: 'my-pegasus-index', // Default: 'ai-sdk-pegasus'
  marengoIndexName: 'my-marengo-index', // Default: 'ai-sdk-marengo'
  baseURL: 'https://api.twelvelabs.io/v1.3', // Optional
  headers: {
    // Custom headers
  },
});
```

## Video Input Methods

### Upload New Video

Use a URL or file data in the message content:

```typescript
{
  type: 'file',
  data: new URL('https://example.com/video.mp4'),
  mediaType: 'video/mp4'
}
```

### Reference Existing Video

Use providerOptions to reference a video already in your index:

```typescript
{
  type: 'file',
  data: 'placeholder',
  mediaType: 'video/mp4',
  providerOptions: {
    twelvelabs: {
      videoId: 'existing-video-id'
    }
  }
}
```

### Response Metadata

Video IDs are returned in the response for future reference:

```typescript
const result = await generateText(/* ... */);
const videoId = result.providerMetadata?.twelvelabs?.videoId;
```

## Supported Models

### Language Models

- `pegasus1.2`: Video understanding and analysis (uses Pegasus index)
- `marengo2.7`: Video search and retrieval (uses Marengo index)

### Embedding Models

- `marengo2.7`: Text, image, and audio embeddings (uses Marengo index)

### How Indexes Work

The provider automatically manages two separate indexes:

1. **Pegasus Index** (`ai-sdk-pegasus` by default):

   - Created automatically when using `pegasus1.2` model
   - Configured with `pegasus1.2` model for video analysis

2. **Marengo Index** (`ai-sdk-marengo` by default):
   - Created automatically when using `marengo2.7` model or embeddings
   - Configured with `marengo2.7` model for search and embeddings

Indexes are created on first use, so you don't need to manually create them unless you want custom configurations.

## Error Handling

The provider includes specific error handling for Twelve Labs API errors:

```typescript
try {
  const result = await generateText({
    model: twelvelabs('pegasus1.2', { videoId: 'invalid-id' }),
    prompt: 'Analyze this video',
  });
} catch (error) {
  if (error instanceof TwelveLabsError) {
    console.error('Twelve Labs error:', error.message);
  }
}
```
