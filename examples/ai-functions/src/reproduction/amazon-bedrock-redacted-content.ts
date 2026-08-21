import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import {
  generateObject,
  generateText,
  streamText,
  tool,
  type ToolCallPart,
} from 'ai';
import { z } from 'zod';

const modelId = 'us.openai.gpt-5.6-luna';
const prompt =
  'Transcribe this CSV, preserving order.\nname,parent\nSales,\nTeam1,Sales';

const groupsSchema = z.object({
  groups: z.array(
    z.object({
      name: z.string(),
      parentGroupName: z.string(),
    }),
  ),
});

const propose = tool({
  description: 'finalize the draft',
  inputSchema: groupsSchema,
});

type JsonResponseObservation = {
  status: number;
  body: string;
};

async function main() {
  const jsonResponses: JsonResponseObservation[] = [];

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        jsonResponses.push({
          status: response.status,
          body: await response.clone().text(),
        });
      }

      return response;
    },
  });

  const model = bedrock(modelId);
  const primaryFailures: string[] = [];

  let generateError: unknown;
  let generateContent = '';
  try {
    const result = await generateText({
      model,
      tools: { propose },
      toolChoice: 'required',
      prompt,
      maxRetries: 0,
    });
    generateContent = JSON.stringify(result.content);
  } catch (error) {
    generateError = error;
  }

  const generateResponse = jsonResponses[0];
  const generateReturnedRedactedContent =
    generateResponse?.body.includes('"redactedContent"') ?? false;
  const generateErrorText =
    generateError instanceof Error
      ? `${generateError.name}: ${generateError.message}`
      : String(generateError);
  const generateRejectedValidResponse =
    generateResponse?.status === 200 &&
    generateReturnedRedactedContent &&
    generateErrorText.includes('Invalid JSON response');

  if (generateRejectedValidResponse) {
    primaryFailures.push(
      'generateText rejected an HTTP 200 response containing reasoningContent.redactedContent',
    );
  } else if (generateError != null) {
    throw generateError;
  } else if (!generateReturnedRedactedContent) {
    throw new Error(
      'The generateText response did not contain reasoningContent.redactedContent, so the reported scenario could not be evaluated.',
    );
  } else if (!generateContent.includes('"redactedContent"')) {
    primaryFailures.push(
      'generateText dropped reasoningContent.redactedContent from the mapped result',
    );
  }

  let generateObjectError: unknown;
  try {
    await generateObject({
      model,
      schema: groupsSchema,
      prompt,
      maxRetries: 0,
    });
  } catch (error) {
    generateObjectError = error;
  }

  const generateObjectResponse = jsonResponses[1];
  const generateObjectReturnedRedactedContent =
    generateObjectResponse?.body.includes('"redactedContent"') ?? false;
  const generateObjectErrorText =
    generateObjectError instanceof Error
      ? `${generateObjectError.name}: ${generateObjectError.message}`
      : String(generateObjectError);
  const generateObjectRejectedValidResponse =
    generateObjectResponse?.status === 200 &&
    generateObjectReturnedRedactedContent &&
    generateObjectErrorText.includes('Invalid JSON response');

  if (generateObjectRejectedValidResponse) {
    primaryFailures.push(
      'generateObject rejected an HTTP 200 response containing reasoningContent.redactedContent',
    );
  } else if (generateObjectError != null) {
    throw generateObjectError;
  } else if (!generateObjectReturnedRedactedContent) {
    throw new Error(
      'The generateObject response did not contain reasoningContent.redactedContent, so the reported scenario could not be evaluated.',
    );
  }

  const streamErrors: unknown[] = [];
  const streamToolCalls: ToolCallPart[] = [];
  const streamParts: unknown[] = [];
  const rawStreamEvents: unknown[] = [];
  const streamResult = streamText({
    model,
    tools: { propose },
    toolChoice: 'required',
    prompt,
    maxRetries: 0,
    includeRawChunks: true,
  });

  for await (const part of streamResult.fullStream) {
    if (part.type !== 'raw') {
      streamParts.push(part);
    }

    if (part.type === 'error') {
      streamErrors.push(part.error);
    } else if (part.type === 'tool-call' && !part.dynamic) {
      streamToolCalls.push(part);
    } else if (part.type === 'raw') {
      rawStreamEvents.push(part.rawValue);
    }
  }

  const rawStreamText = JSON.stringify(rawStreamEvents);
  const streamReturnedRedactedContent =
    rawStreamText.includes('"redactedContent"');
  const streamErrorText = streamErrors
    .map(error =>
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error),
    )
    .join('\n');
  const streamRejectedRedactedContent =
    streamReturnedRedactedContent &&
    streamErrorText.includes('Type validation failed');

  if (streamRejectedRedactedContent) {
    primaryFailures.push(
      'streamText emitted a validation error for reasoningContent.redactedContent',
    );
  } else if (streamErrors.length > 0) {
    throw streamErrors[0];
  } else if (!streamReturnedRedactedContent) {
    throw new Error(
      'The streamText response did not contain reasoningContent.redactedContent, so the reported scenario could not be evaluated.',
    );
  } else if (!JSON.stringify(streamParts).includes('"redactedContent"')) {
    primaryFailures.push(
      'streamText dropped reasoningContent.redactedContent from the mapped stream',
    );
  }

  if (streamToolCalls.length !== 1) {
    throw new Error(
      `streamText returned ${streamToolCalls.length} tool calls instead of one`,
    );
  }

  if (primaryFailures.length > 0) {
    console.error(`ISSUE_19062_REPRODUCED: ${primaryFailures.join('; ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #19062 was not reproduced: all documented redactedContent responses were accepted.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
