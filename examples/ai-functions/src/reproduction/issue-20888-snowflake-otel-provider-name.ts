import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { OpenTelemetry } from '@ai-sdk/otel';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { generateText, registerTelemetry } from 'ai';

async function main() {
  const exporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  registerTelemetry(
    new OpenTelemetry({
      tracer: tracerProvider.getTracer('issue-20888'),
    }),
  );

  const snowflake = createOpenAICompatible({
    name: 'snowflake',
    apiKey: 'unused-for-reproduction',
    baseURL: 'https://example.invalid/api/v2/cortex/v1',
    fetch: async () =>
      new Response(
        JSON.stringify({
          id: 'chatcmpl-issue-20888',
          object: 'chat.completion',
          created: 1,
          model: 'example-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'ok' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  });

  const model = snowflake.chatModel('example-model');

  if (model.provider !== 'snowflake.chat') {
    throw new Error(
      `Reproduction precondition failed: model.provider was ${JSON.stringify(model.provider)}`,
    );
  }

  await generateText({
    model,
    prompt: 'Hello',
    telemetry: { isEnabled: true },
  });
  await tracerProvider.forceFlush();

  const chatSpan = exporter
    .getFinishedSpans()
    .find(span => span.attributes['gen_ai.operation.name'] === 'chat');

  if (chatSpan == null) {
    throw new Error('Reproduction setup failed: no chat telemetry span found');
  }

  const providerName = chatSpan.attributes['gen_ai.provider.name'];

  await tracerProvider.shutdown();

  if (providerName !== 'snowflake') {
    console.error(
      'ISSUE_20888_REPRODUCED: gen_ai.provider.name was not normalized to snowflake',
    );
    console.error(
      `Observed gen_ai.provider.name: ${JSON.stringify(providerName)}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #20888 is fixed: gen_ai.provider.name is normalized to snowflake',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
