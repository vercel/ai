import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, tool, type Warning } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';

const anthropicFixture = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../../../packages/anthropic/src/__fixtures__/anthropic-issue-22291-strict-false.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

const bedrockFixture = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../../../packages/amazon-bedrock/src/__fixtures__/bedrock-issue-22291-strict-false.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

type LoggedWarnings = {
  warnings: Warning[];
  provider: string;
  model: string;
};

type RequestBody = {
  tools?: Array<{ strict?: boolean }>;
  toolConfig?: {
    tools?: Array<{ toolSpec?: { strict?: boolean } }>;
  };
};

function parseRequestBody(init: RequestInit | undefined): RequestBody {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected a JSON request body.');
  }

  return JSON.parse(init.body);
}

function assertStrictOmitted({
  provider,
  requestBody,
}: {
  provider: 'Anthropic' | 'Amazon Bedrock';
  requestBody: RequestBody;
}) {
  const tools =
    provider === 'Anthropic'
      ? requestBody.tools
      : requestBody.toolConfig?.tools?.map(tool => tool.toolSpec ?? {});

  if (tools == null || tools.length === 0) {
    throw new Error(`${provider} request did not contain tools.`);
  }

  if (tools.some(tool => Object.hasOwn(tool, 'strict'))) {
    throw new Error(
      `${provider} request unexpectedly included unsupported strict fields.`,
    );
  }
}

function isReportedWarning(
  warning: Warning,
  provider: 'Anthropic' | 'Amazon Bedrock',
  strict: boolean,
) {
  const providerText =
    provider === 'Anthropic' ? 'this provider' : 'this model on Amazon Bedrock';

  return (
    warning.type === 'unsupported' &&
    warning.feature === 'strict' &&
    warning.details ===
      `Tool 'refresh_repo' has strict: ${strict}, but strict mode is not supported by ${providerText}. The strict property will be ignored.`
  );
}

async function main() {
  const loggedWarnings: LoggedWarnings[] = [];
  const anthropicRequests: RequestBody[] = [];
  const bedrockRequests: RequestBody[] = [];

  globalThis.AI_SDK_LOG_WARNINGS = options => {
    loggedWarnings.push(options);
  };

  const anthropic = createAnthropic({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      anthropicRequests.push(parseRequestBody(init));
      return Response.json(anthropicFixture);
    },
  });

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key-id',
    secretAccessKey: 'test-secret-access-key',
    fetch: async (_input, init) => {
      bedrockRequests.push(parseRequestBody(init));
      return Response.json(bedrockFixture);
    },
  });

  const createTools = (strict: boolean) => ({
    refresh_repo: tool({
      description: 'Refresh a repository.',
      inputSchema: z.object({}),
      strict,
    }),
  });

  const anthropicFalse = await generateText({
    model: anthropic('kimi-k3'),
    prompt: 'hi',
    maxOutputTokens: 16,
    tools: createTools(false),
  });
  const anthropicTrue = await generateText({
    model: anthropic('kimi-k3'),
    prompt: 'hi',
    maxOutputTokens: 16,
    tools: createTools(true),
  });
  const bedrockFalse = await generateText({
    model: bedrock('us.anthropic.claude-sonnet-5'),
    prompt: 'hi',
    maxOutputTokens: 16,
    tools: createTools(false),
  });
  const bedrockTrue = await generateText({
    model: bedrock('us.anthropic.claude-sonnet-5'),
    prompt: 'hi',
    maxOutputTokens: 16,
    tools: createTools(true),
  });

  const anthropicFalseWarnings = anthropicFalse.warnings ?? [];
  const anthropicTrueWarnings = anthropicTrue.warnings ?? [];
  const bedrockFalseWarnings = bedrockFalse.warnings ?? [];
  const bedrockTrueWarnings = bedrockTrue.warnings ?? [];

  assertStrictOmitted({
    provider: 'Anthropic',
    requestBody: anthropicRequests[0],
  });
  assertStrictOmitted({
    provider: 'Anthropic',
    requestBody: anthropicRequests[1],
  });
  assertStrictOmitted({
    provider: 'Amazon Bedrock',
    requestBody: bedrockRequests[0],
  });
  assertStrictOmitted({
    provider: 'Amazon Bedrock',
    requestBody: bedrockRequests[1],
  });

  if (
    anthropicTrueWarnings.length !== 1 ||
    !isReportedWarning(anthropicTrueWarnings[0], 'Anthropic', true)
  ) {
    throw new Error(
      'Anthropic strict: true control did not emit the expected unsupported warning.',
    );
  }

  if (
    bedrockTrueWarnings.length !== 1 ||
    !isReportedWarning(bedrockTrueWarnings[0], 'Amazon Bedrock', true)
  ) {
    throw new Error(
      'Amazon Bedrock strict: true control did not emit the expected unsupported warning.',
    );
  }

  const falseWarnings = [
    ...anthropicFalseWarnings.map(warning => ({
      provider: 'Anthropic' as const,
      warning,
    })),
    ...bedrockFalseWarnings.map(warning => ({
      provider: 'Amazon Bedrock' as const,
      warning,
    })),
  ];

  if (
    falseWarnings.some(
      ({ provider, warning }) => !isReportedWarning(warning, provider, false),
    )
  ) {
    throw new Error(
      `Unexpected warnings were returned for strict: false: ${JSON.stringify(falseWarnings)}`,
    );
  }

  const falseLoggedWarnings = loggedWarnings.flatMap(entry =>
    entry.warnings
      .filter(warning =>
        isReportedWarning(
          warning,
          entry.provider === 'anthropic.messages'
            ? 'Anthropic'
            : 'Amazon Bedrock',
          false,
        ),
      )
      .map(warning => ({
        provider: entry.provider,
        model: entry.model,
        warning,
      })),
  );

  console.log(
    JSON.stringify(
      {
        anthropic: {
          strictFalseWarnings: anthropicFalseWarnings,
          strictTrueWarnings: anthropicTrueWarnings,
          requests: anthropicRequests,
        },
        amazonBedrock: {
          strictFalseWarnings: bedrockFalseWarnings,
          strictTrueWarnings: bedrockTrueWarnings,
          requests: bedrockRequests,
        },
        strictFalseLoggedWarnings: falseLoggedWarnings,
      },
      null,
      2,
    ),
  );

  if (falseWarnings.length > 0 || falseLoggedWarnings.length > 0) {
    throw new Error(
      'Reproduced issue #22291: strict: false emitted unsupported strict warnings for Anthropic and Amazon Bedrock.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
