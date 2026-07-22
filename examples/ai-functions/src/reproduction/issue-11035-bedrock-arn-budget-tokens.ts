import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import fs from 'node:fs';

const applicationProfileArn =
  'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/issue11035';
const reproducedSignal =
  'ISSUE_11035_REPRODUCED: budgetTokens was ignored for an Anthropic application inference profile ARN, so no reasoning output was returned.';

function readFixture(filename: string) {
  return JSON.parse(
    fs.readFileSync(
      new URL(
        `../../../../packages/amazon-bedrock/src/__fixtures__/${filename}`,
        import.meta.url,
      ),
      'utf8',
    ),
  );
}

async function main() {
  (
    globalThis as typeof globalThis & {
      AI_SDK_LOG_WARNINGS?: false;
    }
  ).AI_SDK_LOG_WARNINGS = false;

  let requestBody:
    | {
        additionalModelRequestFields?: {
          thinking?: unknown;
        };
      }
    | undefined;

  const bedrock = createAmazonBedrock({
    apiKey: 'replay-key',
    region: 'us-east-1',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      const responseFixture =
        requestBody?.additionalModelRequestFields?.thinking == null
          ? 'amazon-bedrock-issue-11035-without-thinking.json'
          : 'amazon-bedrock-issue-11035-with-thinking.json';

      return new Response(JSON.stringify(readFixture(responseFixture)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await generateText({
    model: bedrock(applicationProfileArn),
    prompt: 'Return only the word OK.',
    maxOutputTokens: 1100,
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: 'enabled',
          budgetTokens: 1024,
        },
      },
    },
  });

  const budgetWarning = (result.warnings ?? []).find(
    warning =>
      warning.type === 'unsupported' && warning.feature === 'budgetTokens',
  );

  if (
    result.reasoningText == null &&
    requestBody?.additionalModelRequestFields?.thinking == null &&
    budgetWarning != null
  ) {
    console.error(reproducedSignal);
    process.exitCode = 1;
    return;
  }

  if (result.reasoningText == null) {
    throw new Error(
      'Unexpected replay result: reasoning output was absent without the complete reported failure.',
    );
  }

  console.log('Issue 11035 did not reproduce.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
