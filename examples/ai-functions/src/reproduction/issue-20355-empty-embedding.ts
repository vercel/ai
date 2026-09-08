import { InvalidResponseDataError, embed } from 'ai';
import { MockEmbeddingModelV3 } from 'ai/test';

class TrackingSpan {
  readonly events: string[] = [];
  endCalls = 0;
  statusCode: number | undefined;

  constructor(readonly name: string) {}

  setAttributes() {
    return this;
  }

  recordException() {
    this.events.push('exception');
  }

  setStatus(status: { code: number }) {
    this.statusCode = status.code;
    return this;
  }

  end() {
    this.endCalls++;
  }
}

class TrackingTracer {
  readonly spans: TrackingSpan[] = [];

  startActiveSpan(name: string, ...args: unknown[]) {
    const callback = args.find(argument => typeof argument === 'function') as
      | ((span: TrackingSpan) => unknown)
      | undefined;

    if (callback == null) {
      throw new Error('Expected startActiveSpan callback.');
    }

    const span = new TrackingSpan(name);
    this.spans.push(span);
    return callback(span);
  }
}

async function main() {
  const tracer = new TrackingTracer();
  const model = new MockEmbeddingModelV3({
    doEmbed: async () => ({
      embeddings: [],
      usage: { tokens: 5 },
      warnings: [],
    }),
  });

  let result: Awaited<ReturnType<typeof embed>> | undefined;
  let embedError: unknown;

  try {
    result = await embed({
      model,
      value: 'test',
      experimental_telemetry: {
        isEnabled: true,
        tracer: tracer as unknown as NonNullable<
          NonNullable<
            Parameters<typeof embed>[0]['experimental_telemetry']
          >['tracer']
        >,
      },
    });
  } catch (error) {
    embedError = error;
  }

  const outerSpan = tracer.spans.find(span => span.name === 'ai.embed');

  if (embedError != null) {
    if (!InvalidResponseDataError.isInstance(embedError)) {
      throw embedError;
    }

    if (model.doEmbedCalls.length !== 1) {
      throw new Error(
        `Expected one provider call, received ${model.doEmbedCalls.length}.`,
      );
    }

    if (
      outerSpan?.statusCode !== 2 ||
      !outerSpan.events.includes('exception')
    ) {
      throw new Error(
        'Expected the rejected embed call to mark its telemetry span as an error.',
      );
    }

    return;
  }

  let downstreamError: unknown;

  try {
    result!.embedding.length;
  } catch (error) {
    downstreamError = error;
  }

  console.log(
    JSON.stringify(
      {
        embeddingType: typeof result!.embedding,
        providerCalls: model.doEmbedCalls.length,
        downstreamError:
          downstreamError instanceof Error
            ? {
                name: downstreamError.name,
                message: downstreamError.message,
              }
            : undefined,
        spans: tracer.spans.map(span => ({
          name: span.name,
          endCalls: span.endCalls,
          statusCode: span.statusCode,
          events: span.events,
        })),
      },
      null,
      2,
    ),
  );

  throw new Error(
    'Reproduced issue #20355: embed() resolved with an undefined embedding instead of rejecting the empty provider response.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
