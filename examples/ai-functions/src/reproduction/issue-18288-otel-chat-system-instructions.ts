import { OpenTelemetry } from '@ai-sdk/otel';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { generateText, registerTelemetry } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const systemPrompt =
  'You translate natural-language requests into filter expressions.';

async function main() {
  const exporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  registerTelemetry(
    new OpenTelemetry({
      tracer: tracerProvider.getTracer('issue-18288'),
    }),
  );

  const model = new MockLanguageModelV4({
    provider: 'openai.chat',
    modelId: 'issue-18288-model',
    doGenerate: {
      content: [{ type: 'text', text: 'status = root' }],
      finishReason: { raw: undefined, unified: 'stop' },
      usage: {
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 3,
          text: 3,
          reasoning: undefined,
        },
      },
      warnings: [],
    },
  });

  await generateText({
    model,
    system: systemPrompt,
    prompt: 'only root spans',
  });
  await tracerProvider.forceFlush();

  const spans = exporter.getFinishedSpans();
  const rootSpan = spans.find(
    span => span.attributes['gen_ai.operation.name'] === 'invoke_agent',
  );
  const chatSpan = spans.find(
    span => span.attributes['gen_ai.operation.name'] === 'chat',
  );

  if (rootSpan == null || chatSpan == null) {
    throw new Error(
      'Issue 18288 harness failed to export root and chat spans.',
    );
  }

  const providerPrompt = model.doGenerateCalls[0]?.prompt;
  const providerReceivedSystemPrompt = providerPrompt?.some(
    message =>
      message.role === 'system' && message.content.includes(systemPrompt),
  );

  const rootSystemInstructions = parseJsonAttribute(
    rootSpan.attributes['gen_ai.system_instructions'],
  );
  const chatSystemInstructions = parseJsonAttribute(
    chatSpan.attributes['gen_ai.system_instructions'],
  );
  const chatInputMessages = parseJsonAttribute(
    chatSpan.attributes['gen_ai.input.messages'],
  );

  console.log(
    JSON.stringify(
      {
        providerReceivedSystemPrompt,
        root: {
          systemInstructions: rootSystemInstructions,
          inputMessages: parseJsonAttribute(
            rootSpan.attributes['gen_ai.input.messages'],
          ),
        },
        chat: {
          systemInstructions: chatSystemInstructions,
          inputMessages: chatInputMessages,
        },
      },
      null,
      2,
    ),
  );

  if (!providerReceivedSystemPrompt) {
    throw new Error(
      'Issue 18288 harness failed: the provider did not receive the system prompt.',
    );
  }

  if (!containsText(rootSystemInstructions, systemPrompt)) {
    throw new Error(
      'Issue 18288 harness failed: the root span did not contain the system prompt.',
    );
  }

  const chatContainsSystemPrompt =
    containsText(chatSystemInstructions, systemPrompt) ||
    containsSystemMessage(chatInputMessages, systemPrompt);

  if (!chatContainsSystemPrompt) {
    throw new Error(
      'ISSUE_18288_REPRODUCED: chat span omits the system prompt from both gen_ai.system_instructions and gen_ai.input.messages',
    );
  }
}

function parseJsonAttribute(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return JSON.parse(value);
}

function containsText(value: unknown, expected: string): boolean {
  const serialized = JSON.stringify(value);
  return typeof serialized === 'string' && serialized.includes(expected);
}

function containsSystemMessage(value: unknown, expected: string): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      message =>
        typeof message === 'object' &&
        message != null &&
        'role' in message &&
        message.role === 'system' &&
        containsText(message, expected),
    )
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
