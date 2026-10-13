import {
  createAmazonBedrock,
  type AmazonBedrockProvider,
} from '@ai-sdk/amazon-bedrock';
import { APICallError } from '@ai-sdk/provider';
import { generateText } from 'ai';

const modelId = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const documentText = 'The quarterly revenue was 42 million.';

const invalidFilenames = [
  "John's report.txt",
  'invoice #123.txt',
  'a&b.txt',
  'report,2026.txt',
  'résumé.txt',
  '분기보고서.txt',
  'Report -  Final.txt',
  'a\tb.txt',
  `${'a'.repeat(201)}.txt`,
  '.txt',
] as const;

const controlFilenames = [
  'Johns report.txt',
  'Q3-report.txt',
  'report (final) [v2].txt',
  'Q3_report.txt',
  undefined,
] as const;

type Observation = {
  filename: string | null;
  submittedName: string | null;
  status: number | null;
  answer: string | null;
  error: string | null;
};

let submittedName: string | null = null;
let responseStatus: number | null = null;

const bedrock = createAmazonBedrock({
  fetch: async (input, init) => {
    const body = JSON.parse(String(init?.body));
    submittedName =
      body.messages?.[0]?.content?.find(
        (part: { document?: { name?: string } }) => part.document,
      )?.document?.name ?? null;

    const response = await fetch(input, init);
    responseStatus = response.status;
    return response;
  },
});

async function requestDocument(
  provider: AmazonBedrockProvider,
  filename: string | undefined,
): Promise<Observation> {
  submittedName = null;
  responseStatus = null;

  try {
    const result = await generateText({
      model: provider(modelId),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What was the revenue? Answer in one short sentence.',
            },
            {
              type: 'file',
              data: new TextEncoder().encode(documentText),
              mediaType: 'text/plain',
              filename,
            },
          ],
        },
      ],
    });

    return {
      filename: filename ?? null,
      submittedName,
      status: responseStatus,
      answer: result.text,
      error: null,
    };
  } catch (error) {
    if (
      APICallError.isInstance(error) &&
      [401, 402, 403, 429].includes(error.statusCode ?? 0)
    ) {
      throw new Error(
        `BEDROCK_ACCESS_BLOCKER: HTTP ${error.statusCode}: ${error.message}`,
      );
    }

    return {
      filename: filename ?? null,
      submittedName,
      status:
        APICallError.isInstance(error) && error.statusCode != null
          ? error.statusCode
          : responseStatus,
      answer: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function assertAccepted(observation: Observation, kind: string) {
  if (
    observation.status !== 200 ||
    observation.error !== null ||
    !observation.answer?.includes('42')
  ) {
    throw new Error(
      `${kind} failed unexpectedly: ${JSON.stringify(observation)}`,
    );
  }
}

async function main() {
  const controls: Observation[] = [];
  for (const filename of controlFilenames) {
    const observation = await requestDocument(bedrock, filename);
    controls.push(observation);
    assertAccepted(observation, 'Bedrock control request');
  }

  const invalidCases: Observation[] = [];
  for (const filename of invalidFilenames) {
    invalidCases.push(await requestDocument(bedrock, filename));
  }

  console.log(JSON.stringify({ modelId, controls, invalidCases }, null, 2));

  const rejectedCases = invalidCases.filter(
    observation =>
      observation.status !== 200 ||
      observation.error !== null ||
      !observation.answer?.includes('42'),
  );

  if (rejectedCases.length > 0) {
    throw new Error(
      `BEDROCK_INVALID_DOCUMENT_FILENAMES: ${rejectedCases.length}/${invalidCases.length} uploaded documents were rejected before the model could answer`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
