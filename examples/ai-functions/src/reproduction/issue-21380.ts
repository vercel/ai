import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { parseJSON } from '@ai-sdk/provider-utils';
import { APICallError, generateText, type CallWarning } from 'ai';

const modelId = 'global.anthropic.claude-opus-5';

type SamplingCase = {
  name: 'temperature' | 'topP' | 'topK';
  value: number;
};

type CaseResult = {
  name: string;
  requestBody?: Record<string, unknown>;
  warnings?: CallWarning[];
  text?: string;
  error?: {
    statusCode?: number;
    message: string;
    responseBody?: string;
  };
};

async function runCase(samplingCase?: SamplingCase): Promise<CaseResult> {
  let requestBody: Record<string, unknown> | undefined;

  const bedrock = createAmazonBedrock({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBody = (await parseJSON({
          text: init.body,
        })) as Record<string, unknown>;
      }

      return fetch(input, init);
    },
  });

  try {
    const result = await generateText({
      model: bedrock(modelId),
      prompt: 'Say OK',
      maxOutputTokens: 16,
      ...(samplingCase == null
        ? {}
        : { [samplingCase.name]: samplingCase.value }),
    });

    return {
      name: samplingCase?.name ?? 'control',
      requestBody,
      warnings: result.warnings,
      text: result.text,
    };
  } catch (error) {
    if (!APICallError.isInstance(error)) {
      throw error;
    }

    return {
      name: samplingCase?.name ?? 'control',
      requestBody,
      error: {
        statusCode: error.statusCode,
        message: error.message,
        responseBody: error.responseBody,
      },
    };
  }
}

async function main() {
  const control = await runCase();

  if (control.error != null) {
    throw new Error(
      `Control request without sampling parameters failed: ${JSON.stringify(control.error)}`,
    );
  }

  const samplingCases: SamplingCase[] = [
    { name: 'temperature', value: 0 },
    { name: 'topP', value: 0.9 },
    { name: 'topK', value: 10 },
  ];
  const results = await Promise.all(
    samplingCases.map(samplingCase => runCase(samplingCase)),
  );

  const providerRejections = results.filter(
    result =>
      result.error?.statusCode === 400 &&
      /deprecated|not supported/i.test(
        `${result.error.message} ${result.error.responseBody ?? ''}`,
      ),
  );

  const unexpectedErrors = results.filter(
    result => result.error != null && !providerRejections.includes(result),
  );

  if (unexpectedErrors.length > 0) {
    throw new Error(
      `Unexpected sampling request errors: ${JSON.stringify(unexpectedErrors)}`,
    );
  }

  const successfulMismatches = results
    .filter(
      (
        result,
      ): result is CaseResult & {
        warnings: CallWarning[];
        requestBody: Record<string, unknown>;
      } => result.error == null && result.requestBody != null,
    )
    .filter(result => {
      const inferenceConfig = result.requestBody.inferenceConfig as
        | Record<string, unknown>
        | undefined;
      const forwarded = inferenceConfig?.[result.name] != null;
      const warned = result.warnings.some(
        warning =>
          warning.type === 'unsupported' && warning.feature === result.name,
      );

      return forwarded || !warned;
    });

  console.log(
    JSON.stringify(
      {
        modelId,
        control,
        samplingResults: results,
        providerRejections: providerRejections.map(result => result.name),
        successfulMismatches: successfulMismatches.map(result => result.name),
      },
      null,
      2,
    ),
  );

  if (providerRejections.length > 0) {
    throw new Error(
      `Reproduced issue #21380: Bedrock rejected forwarded Claude Opus 5 sampling parameters with HTTP 400: ${providerRejections.map(result => result.name).join(', ')}.`,
    );
  }

  if (successfulMismatches.length > 0) {
    throw new Error(
      `Issue #21380 remains: sampling parameters were forwarded without unsupported warnings: ${successfulMismatches.map(result => result.name).join(', ')}.`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
