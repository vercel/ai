# Cactus Provider

The Vercel AI SDK Cactus Provider enables the use of on-device, local LLMs in React Native applications. It serves as a bridge between the Vercel AI SDK's streamlined API and the [Cactus](https://github.com/cactus-compute/cactus) industry-leading C++ inference engine.

This provider lets you to run any GGUF-compatible model from platforms like HuggingFace directly on a user's device, ensuring privacy, offline availability, and low-latency inference.

## Setup

### Prerequisites

The Cactus provider requires `react-native-fs` for model management.

Install the required peer dependencies:

```bash
npm install react-native-fs
npx pod-install
```

### Configuration

Ensure your project's `tsconfig.json` includes `"esnext.asynciterable"` in the `lib` array to provide the necessary types for asynchronous iteration over streams.

**`tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["esnext", "esnext.asynciterable"]
  }
}
```

## Provider Instance

Create an instance of the Cactus provider that you can use to create language model clients.

```ts
import { createCactus } from './cactus-provider'; // Adjust path accordingly

const cactus = createCactus();
```

## Language Model

The Cactus language model runs locally on the user's device. To use it, you must first instantiate it with a URL pointing to a GGUF model file.

```ts
const model = cactus.languageModel(
  'https://huggingface.co/Cactus-Compute/SmolVLM2-256m-Instruct-GGUF/resolve/main/SmolVLM2-256M-Video-Instruct-Q8_0.gguf'
);
```

Before use, the model must be downloaded and initialized. This provider includes methods to manage this lifecycle:

```tsx
import { ModelStatus } from './cactus-chat-language-model'; // Adjust path

function MyComponent() {
  const [status, setStatus] = useState(ModelStatus.IDLE);

  useEffect(() => {
    async function setupModel() {
      setStatus(ModelStatus.DOWNLOADING);
      await model.downloadModel();
      setStatus(ModelStatus.INITIALIZING);
      await model.initialize();
      setStatus(ModelStatus.READY);
    }
    setupModel();
  }, []);

  // ... render UI based on status
}
```

### Streaming

You can stream text responses using the `stream` method. The provider manages the complexities of the underlying stateful model, allowing you to use it as if it were a stateless API.

```ts
import { streamText } from 'ai';

//...

const { textStream } = await streamText({
  model,
  prompt: 'Who is Roman?',
});

for await (const textPart of textStream) {
  // ... process text part
}
```

## Model Capabilities

| Feature | `doGenerate` | `doStream` |
| :-- | :--: | :--: |
| **Text** | ✅ | ✅ |
| **Images** | ❌ | ❌ |
| **Tools** | ❌ | ❌ |
| **Object** | ❌ | ❌ |

While the underlying Cactus engine supports Vision Language Models (VLMs), this provider currently only exposes text-based chat completions.

## Unsupported Methods

The Cactus provider is focused on providing core text generation capabilities on-device. The following `LanguageModelV2` methods are **not supported**:

-   `doEmbed`: For creating embeddings from text.
-   `doTools`: For using tools or function calling.
-   `doObject`: For generating structured object outputs.

The `supportedUrls` property is also not applicable, as Cactus runs models locally and does not interact with remote API endpoints. 