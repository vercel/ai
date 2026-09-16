import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateObject, generateText, Output } from 'ai';
import { z } from 'zod';
import { AwsClient } from '../../../../packages/amazon-bedrock/node_modules/aws4fetch';

const region = process.env.AWS_REGION ?? 'us-east-1';
const sourceProfileId = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const requiredKeys = ['assignments', 'entities', 'relations'] as const;

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

type ConverseBody = {
  messages?: unknown;
  inferenceConfig?: unknown;
  additionalModelRequestFields?: {
    output_config?: {
      format?: unknown;
    };
  };
  toolConfig?: {
    tools?: Array<{
      toolSpec?: {
        name?: string;
        strict?: boolean;
        inputSchema?: {
          json?: unknown;
        };
      };
    }>;
  };
};

type InferenceProfileSummary = {
  inferenceProfileArn: string;
  inferenceProfileId: string;
};

function createControlPlaneClient() {
  return new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    service: 'bedrock',
    region,
  });
}

async function getSourceProfileArn(client: AwsClient) {
  const response = await client.fetch(
    `https://bedrock.${region}.amazonaws.com/inference-profiles?maxResults=100`,
  );

  if (!response.ok) {
    throw new Error(
      `ListInferenceProfiles failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }

  const body = (await response.json()) as {
    inferenceProfileSummaries: InferenceProfileSummary[];
  };
  const sourceProfile = body.inferenceProfileSummaries.find(
    profile => profile.inferenceProfileId === sourceProfileId,
  );

  if (sourceProfile == null) {
    throw new Error(`Bedrock did not list the required ${sourceProfileId}.`);
  }

  return sourceProfile.inferenceProfileArn;
}

async function createApplicationProfile(
  client: AwsClient,
  sourceProfileArn: string,
) {
  const suffix = Date.now().toString(36);
  const response = await client.fetch(
    `https://bedrock.${region}.amazonaws.com/inference-profiles`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        inferenceProfileName: `ai-sdk-20780-${suffix}`,
        description: 'Temporary reproduction for vercel ai issue 20780',
        modelSource: { copyFrom: sourceProfileArn },
        tags: [
          {
            key: 'purpose',
            value: 'ai-sdk-issue-20780-reproduction',
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `CreateInferenceProfile failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }

  return (await response.json()) as {
    inferenceProfileArn: string;
    status: string;
  };
}

async function deleteApplicationProfile(client: AwsClient, profileArn: string) {
  const profileId = profileArn.slice(profileArn.lastIndexOf('/') + 1);
  const response = await client.fetch(
    `https://bedrock.${region}.amazonaws.com/inference-profiles/${encodeURIComponent(profileId)}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    console.error(
      `Cleanup warning: DeleteInferenceProfile failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }
}

async function runGenerateObject(profileArn: string) {
  let requestBody: ConverseBody | undefined;
  let responseBody: unknown;
  const bedrock = createAmazonBedrock({
    region,
    fetch: async (input, init) => {
      requestBody = JSON.parse(String(init?.body)) as ConverseBody;
      const response = await fetch(input, init);
      responseBody = await response.clone().json();
      return response;
    },
  });

  await generateObject({
    model: bedrock(profileArn),
    schema,
    prompt,
  });

  return { requestBody: requestBody!, responseBody };
}

async function runOutputObject(profileArn: string) {
  let requestBody: ConverseBody | undefined;
  let responseBody: unknown;
  const bedrock = createAmazonBedrock({
    region,
    fetch: async (input, init) => {
      requestBody = JSON.parse(String(init?.body)) as ConverseBody;
      const response = await fetch(input, init);
      responseBody = await response.clone().json();
      return response;
    },
  });

  await generateText({
    model: bedrock(profileArn),
    output: Output.object({ schema }),
    prompt,
    providerOptions: {
      bedrock: {
        structuredOutputMode: 'outputFormat',
      },
    },
  });

  return { requestBody: requestBody!, responseBody };
}

function summarizeRequest(requestBody: ConverseBody) {
  return {
    outputConfig:
      requestBody.additionalModelRequestFields?.output_config?.format,
    tools:
      requestBody.toolConfig?.tools?.map(tool => ({
        name: tool.toolSpec?.name,
        strict: tool.toolSpec?.strict,
      })) ?? [],
  };
}

async function callNativeStructuredOutput(
  client: AwsClient,
  profileArn: string,
  sdkRequest: ConverseBody,
) {
  const jsonTool = sdkRequest.toolConfig?.tools?.find(
    tool => tool.toolSpec?.name === 'json',
  );
  const jsonSchema = jsonTool?.toolSpec?.inputSchema?.json;

  if (jsonSchema == null) {
    throw new Error(
      'The AI SDK request did not contain the fallback json tool.',
    );
  }

  const directRequest = {
    messages: sdkRequest.messages,
    inferenceConfig: sdkRequest.inferenceConfig,
    additionalModelRequestFields: {
      output_config: {
        format: {
          type: 'json_schema',
          schema: jsonSchema,
        },
      },
    },
  };
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(profileArn)}/converse`;
  const response = await client.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(directRequest),
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Direct native Converse request failed with HTTP ${response.status}: ${responseText}`,
    );
  }

  const responseBody = JSON.parse(responseText) as {
    output?: {
      message?: {
        content?: Array<{ text?: string }>;
      };
    };
  };
  const outputText = responseBody.output?.message?.content
    ?.map(part => part.text ?? '')
    .join('');
  const output = JSON.parse(outputText ?? '') as Record<string, unknown>;

  for (const key of requiredKeys) {
    if (!Array.isArray(output[key])) {
      throw new Error(`Direct native response omitted required array ${key}.`);
    }
  }

  return responseBody;
}

async function main() {
  const client = createControlPlaneClient();
  let profileArn: string | undefined;

  try {
    const sourceProfileArn = await getSourceProfileArn(client);
    const profile = await createApplicationProfile(client, sourceProfileArn);
    profileArn = profile.inferenceProfileArn;

    const generateObjectResult = await runGenerateObject(profileArn);
    const outputObjectResult = await runOutputObject(profileArn);
    const directNativeResponse = await callNativeStructuredOutput(
      client,
      profileArn,
      outputObjectResult.requestBody,
    );

    const generateObjectRequest = summarizeRequest(
      generateObjectResult.requestBody,
    );
    const outputObjectRequest = summarizeRequest(
      outputObjectResult.requestBody,
    );

    console.log(
      JSON.stringify(
        {
          profileStatus: profile.status,
          generateObject: {
            request: generateObjectRequest,
            response: generateObjectResult.responseBody,
          },
          outputObjectOutputFormat: {
            request: outputObjectRequest,
            response: outputObjectResult.responseBody,
          },
          directNativeResponse,
        },
        null,
        2,
      ),
    );

    const generateObjectUsedNativeOutput =
      generateObjectRequest.outputConfig != null &&
      generateObjectRequest.tools.length === 0;
    const outputObjectUsedNativeOutput =
      outputObjectRequest.outputConfig != null &&
      outputObjectRequest.tools.length === 0;

    if (!generateObjectUsedNativeOutput || !outputObjectUsedNativeOutput) {
      throw new Error(
        'Reproduced issue #20780: application inference profile structured output used the synthetic json tool instead of native output_config.',
      );
    }
  } finally {
    if (profileArn != null) {
      await deleteApplicationProfile(client, profileArn);
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
