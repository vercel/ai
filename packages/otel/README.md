# AI SDK - OpenTelemetry

The **[@ai-sdk/otel](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)** package provides [OpenTelemetry](https://opentelemetry.io/) telemetry support for the [AI SDK](https://ai-sdk.dev/docs), enabling distributed tracing of AI SDK operations.

## Setup

The OpenTelemetry package is available in the `@ai-sdk/otel` module. You can install it with

```bash
npm i @ai-sdk/otel
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Example

```ts
import { openai } from '@ai-sdk/openai';
import { generateText, registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';

registerTelemetry(new OpenTelemetry());

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
});

sdk.start();

const { text } = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
  telemetry: { functionId: 'lasagna-recipe' },
});

await sdk.shutdown();
```

## Documentation

Please check out the **[AI SDK telemetry documentation](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)** for more information.
