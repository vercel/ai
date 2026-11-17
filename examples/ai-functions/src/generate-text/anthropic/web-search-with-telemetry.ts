import { anthropic } from '@ai-sdk/anthropic';
import { OpenTelemetry } from '@ai-sdk/otel';
import { generateText, registerTelemetry, type ModelMessage } from 'ai';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { run } from '../../lib/run';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
});

sdk.start();
registerTelemetry(new OpenTelemetry());

run(async () => {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: 'What is the current Node.js LTS version?',
    },
  ];

  const first = await generateText({
    model: anthropic('claude-sonnet-5-5'),
    messages,
    tools: {
      web_search: anthropic.tools.webSearch_20250305({ maxUses: 1 }),
    },
    telemetry: { functionId: 'web-search-chat' },
  });

  console.log(first.text);
  messages.push(...first.finalStep.response.messages);
  messages.push({ role: 'user', content: 'When does it reach end of life?' });

  const second = await generateText({
    model: anthropic('claude-sonnet-5-5'),
    messages,
    tools: {
      web_search: anthropic.tools.webSearch_20250305({ maxUses: 1 }),
    },
    telemetry: { functionId: 'web-search-chat' },
  });

  console.log(second.text);

  await sdk.shutdown();
});
