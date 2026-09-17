import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createSigV4FetchFunction } from '../../../../packages/amazon-bedrock/src/bedrock-sigv4-fetch';

const region = 'us-east-1';
const profileArn =
  process.env.AWS_BEDROCK_APPLICATION_INFERENCE_PROFILE_ARN ??
  'arn:aws:bedrock:us-east-1:474668406012:application-inference-profile/kr2b9n8klm2f';

const jsonSchema = {
  type: 'object',
  properties: {
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          category: { type: 'string', enum: ['a', 'b'] },
        },
        required: ['id', 'category'],
        additionalProperties: false,
      },
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        additionalProperties: false,
      },
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
        },
        required: ['from', 'to'],
        additionalProperties: false,
      },
    },
  },
  required: ['assignments', 'entities', 'relations'],
  additionalProperties: false,
} as const;

const schema = z.object({
  assignments: z.array(
    z.object({
      id: z.string(),
      category: z.enum(['a', 'b']),
    }),
  ),
  entities: z.array(z.object({ name: z.string() })),
  relations: z.array(z.object({ from: z.string(), to: z.string() })),
});

const prompt =
  'Two items: "see you Tuesday", "can everyone hear me". Categorize each and return empty lists where nothing applies.';

class Issue20780ObservedError extends Error {}

function credentials() {
  return {
    region,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  };
}

async function verifyDirectNativeStructuredOutput() {
  const signedFetch = createSigV4FetchFunction(credentials);
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(profileArn)}/converse`;
  const response = await signedFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 1024 },
      additionalModelRequestFields: {
        output_config: {
          format: {
            type: 'json_schema',
            schema: jsonSchema,
          },
        },
      },
    }),
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Direct Bedrock native structured-output request failed with HTTP ${response.status}: ${responseText}`,
    );
  }

  const body = JSON.parse(responseText) as {
    output?: { message?: { content?: Array<{ text?: string }> } };
  };
  const text = body.output?.message?.content?.find(part => part.text)?.text;
  if (text == null) {
    throw new Error(
      'Direct Bedrock native structured-output response contained no text.',
    );
  }

  schema.parse(JSON.parse(text));
}

type ModelFactoryWithFamily = (
  modelId: string,
  settings: { modelFamily: 'anthropic' },
) => ReturnType<ReturnType<typeof createAmazonBedrock>>;

async function main() {
  await verifyDirectNativeStructuredOutput();

  const requests: Array<Record<string, unknown>> = [];
  const bedrock = createAmazonBedrock({
    region,
    fetch: async (input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return fetch(input, init);
    },
  });
  const model = (bedrock as ModelFactoryWithFamily)(profileArn, {
    modelFamily: 'anthropic',
  });

  for (const structuredOutputMode of ['outputFormat', 'auto'] as const) {
    await generateObject({
      model,
      schema,
      prompt,
      maxRetries: 0,
      providerOptions: {
        bedrock: { structuredOutputMode },
      },
    });
  }

  const failures = requests.flatMap((request, index) => {
    const mode = index === 0 ? 'outputFormat' : 'auto';
    const additionalFields = request.additionalModelRequestFields as
      | {
          output_config?: { format?: unknown };
        }
      | undefined;
    const toolConfig = request.toolConfig as
      | {
          tools?: Array<{ toolSpec?: { name?: string; strict?: boolean } }>;
        }
      | undefined;
    const toolNames = toolConfig?.tools?.map(tool => tool.toolSpec?.name) ?? [];
    const hasNativeOutputFormat =
      additionalFields?.output_config?.format != null;
    const usesSyntheticJsonTool = toolNames.includes('json');

    return hasNativeOutputFormat && !usesSyntheticJsonTool
      ? []
      : [
          `${mode}: output_config.format=${hasNativeOutputFormat}, tools=${JSON.stringify(toolNames)}`,
        ];
  });

  if (failures.length > 0) {
    throw new Issue20780ObservedError(
      `ISSUE #20780 REPRODUCED: application inference profile omitted native structured output and used synthetic json tool. ${failures.join('; ')}`,
    );
  }

  console.log(
    'Application inference profile used native structured output in outputFormat and auto modes.',
  );
}

main().catch(error => {
  if (error instanceof Issue20780ObservedError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error(error);
  process.exitCode = 2;
});
