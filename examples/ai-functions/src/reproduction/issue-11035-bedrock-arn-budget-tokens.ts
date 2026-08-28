import {
  createAmazonBedrock,
  type AmazonBedrockLanguageModelOptions,
} from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import fs from 'node:fs';

const fixtureDirectory = new URL(
  '../../../../packages/amazon-bedrock/src/__fixtures__/',
  import.meta.url,
);

function readFixture(name: string) {
  return JSON.parse(
    fs.readFileSync(new URL(`${name}.json`, fixtureDirectory), 'utf8'),
  );
}

async function main() {
  let requestBody: any;
  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      const thinkingWasRequested =
        requestBody.additionalModelRequestFields?.thinking != null;

      return new Response(
        JSON.stringify(
          readFixture(
            thinkingWasRequested
              ? 'amazon-bedrock-issue-11035-with-thinking'
              : 'amazon-bedrock-issue-11035-without-thinking',
          ),
        ),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const result = await generateText({
    model: bedrock(
      'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/opaque-profile-id',
    ),
    prompt: 'How many letters are in the word cat? Think before answering.',
    maxOutputTokens: 256,
    maxRetries: 0,
    providerOptions: {
      bedrock: {
        reasoningConfig: { type: 'enabled', budgetTokens: 1024 },
      } satisfies AmazonBedrockLanguageModelOptions,
    },
  });

  if (result.reasoning.length === 0) {
    console.error(
      'ISSUE_11035: Expected reasoning output from Anthropic application inference profile ARN, but none was returned.',
    );
    console.error(
      JSON.stringify(
        {
          additionalModelRequestFields:
            requestBody.additionalModelRequestFields,
          maxTokens: requestBody.inferenceConfig?.maxTokens,
          warnings: result.warnings,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const ignoredBudgetWarning = result.warnings?.find(
    warning =>
      warning.type === 'unsupported' && warning.feature === 'budgetTokens',
  );
  if (ignoredBudgetWarning != null) {
    throw new Error(
      'Reasoning was returned, but budgetTokens was still reported as ignored.',
    );
  }

  console.log(
    'Anthropic reasoning was enabled for the application profile ARN.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
