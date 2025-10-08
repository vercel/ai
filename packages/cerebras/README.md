# AI SDK - Cerebras Provider

The **Cerebras provider** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for [Cerebras](https://cerebras.ai), offering high-speed AI model inference powered by Cerebras Wafer-Scale Engines and CS-3 systems.

## Setup

The Cerebras provider is available in the `@ai-sdk/cerebras` module. You can install it with

```bash
npm i @ai-sdk/cerebras
```

## Provider Instance

You can import the default provider instance `cerebras` from `@ai-sdk/cerebras`:

```ts
import { cerebras } from '@ai-sdk/cerebras';
```

## Available Models

Cerebras offers a variety of high-performance language models:

### Llama 3.3 70B

- Model ID: `llama-3.3-70b`
- 70 billion parameters
- Knowledge cutoff: December 2023
- Context Length: 8192
- Training Tokens: 15 trillion+

### Llama 3.1 8B

- Model ID: `llama3.1-8b`
- 8 billion parameters
- Knowledge cutoff: March 2023
- Context Length: 8192
- Training Tokens: 15 trillion+

### GPT-OSS 120B

- Model ID: `gpt-oss-120b`
- 120 billion parameters
- High-performance open-source model
- Optimized for inference speed

### Qwen 3 235B A22B Instruct 2507

- Model ID: `qwen-3-235b-a22b-instruct-2507`
- 235 billion parameters
- Instruction-tuned model
- Released July 2025

### Qwen 3 235B A22B Thinking 2507

- Model ID: `qwen-3-235b-a22b-thinking-2507`
- 235 billion parameters
- Enhanced reasoning capabilities
- Released July 2025

### Qwen 3 32B

- Model ID: `qwen-3-32b`
- 32 billion parameters
- Balanced performance and efficiency
- Multilingual capabilities

### Qwen 3 Coder 480B

- Model ID: `qwen-3-coder-480b`
- 480 billion parameters
- Specialized for code generation and understanding
- Advanced programming capabilities

## Example

```ts
import { cerebras } from '@ai-sdk/cerebras';
import { generateText } from 'ai';

const { text } = await generateText({
  model: cerebras('llama-3.3-70b'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Documentation

For more information about Cerebras' high-speed inference capabilities and API documentation, please visit:

- [Cerebras Inference Documentation](https://inference-docs.cerebras.ai/introduction)
- [Cerebras Website](https://cerebras.ai)

Note: Due to high demand in the early launch phase, context windows are temporarily limited to 8192 tokens in the Free Tier.
