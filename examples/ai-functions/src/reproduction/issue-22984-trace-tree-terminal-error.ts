import { createTraceTreeReporter } from '@ai-sdk/harness/agent';
import { generateText } from 'ai';

async function main() {
  let trace = '';
  const reporter = createTraceTreeReporter({
    write: chunk => {
      trace += chunk;
    },
  });

  async function run(fail: boolean) {
    const traceStart = trace.length;
    const providerFailure = new Error('synthetic provider failure');
    let caughtError: unknown;
    let sawTelemetryError = false;

    try {
      await generateText({
        prompt: 'Hello',
        maxRetries: 0,
        model: {
          specificationVersion: 'v4',
          provider: 'synthetic',
          modelId: 'mock',
          supportedUrls: {},
          async doGenerate() {
            if (fail) {
              throw providerFailure;
            }

            return {
              content: [{ type: 'text' as const, text: 'Hello' }],
              finishReason: { unified: 'stop' as const, raw: 'stop' },
              warnings: [],
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: {
                  total: 1,
                  text: 1,
                  reasoning: 0,
                },
              },
            };
          },
          async doStream() {
            throw new Error('streaming is not used by this reproduction');
          },
        },
        telemetry: {
          integrations: [
            reporter,
            {
              onError() {
                sawTelemetryError = true;
              },
            },
          ],
        },
      });
    } catch (error) {
      caughtError = error;
    }

    if (fail && caughtError !== providerFailure) {
      throw new Error(
        'Reproduction setup failed: generateText did not rethrow the provider error',
      );
    }
    if (!fail && caughtError != null) {
      throw caughtError;
    }

    return {
      fail,
      sawTelemetryError,
      emittedTrace: trace.slice(traceStart),
    };
  }

  const successfulTurn = await run(false);
  if (!successfulTurn.emittedTrace.includes('ai.generateText')) {
    throw new Error(
      'Reproduction control failed: successful generateText turn emitted no trace',
    );
  }

  const failedTurn = await run(true);
  console.log(JSON.stringify({ successfulTurn, failedTurn }));

  if (!failedTurn.sawTelemetryError) {
    throw new Error(
      'Reproduction setup failed: provider failure did not reach telemetry onError',
    );
  }
  if (!failedTurn.emittedTrace.includes('ai.generateText')) {
    throw new Error(
      'ISSUE_22984: failed generateText turn emitted no trace tree',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
