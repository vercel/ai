import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, Output, tool } from 'ai';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';

const MODEL_ID = 'eu.anthropic.claude-sonnet-4-6';
const REGION = 'eu-west-1';
const NATIVE_MAX_OUTPUT_TOKENS = 3600;
const TOOL_MAX_OUTPUT_TOKENS = 6000;
const MAX_NATIVE_RUNS = 3;
const LIVE_FIXTURE_REPOSITORY_PATH =
  'packages/amazon-bedrock/src/__fixtures__/bedrock-sonnet-4-6-native-structured-output-length.json';
const LIVE_FIXTURE_WRITE_PATH = `../../${LIVE_FIXTURE_REPOSITORY_PATH}`;

type BedrockResponse = {
  output?: {
    message?: {
      content?: Array<{ text?: string; toolUse?: unknown }>;
    };
  };
  stopReason?: string;
  usage?: {
    outputTokens?: number;
  };
};

type RecordedCall = {
  request: Record<string, unknown>;
  response: BedrockResponse;
};

const recordedCalls: RecordedCall[] = [];

const recordingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const requestText =
    typeof init?.body === 'string'
      ? init.body
      : input instanceof Request
        ? await input.clone().text()
        : '';
  const responseJson = (await response.clone().json()) as BedrockResponse;

  recordedCalls.push({
    request: requestText === '' ? {} : JSON.parse(requestText),
    response: responseJson,
  });

  return response;
};

const bedrock = createAmazonBedrock({
  region: REGION,
  fetch: recordingFetch,
});

const reviewFlagSchema = z.object({
  type: z.string().optional().describe('The review category for the flag.'),
  severity: z.string().optional().describe('Materiality of the flag.'),
  statement: z
    .string()
    .optional()
    .describe('The drafted statement that needs review or confirmation.'),
  reason: z
    .string()
    .optional()
    .describe('Specific reason this cannot be treated as final yet.'),
  owner: z
    .string()
    .optional()
    .describe(
      'The team best placed to confirm the statement — one of: Facilities, Engineering, Safety, Planning, Operations.',
    ),
  sourceRefs: z
    .array(z.string())
    .optional()
    .describe('Short source labels supporting or motivating the flag.'),
  confidence: z
    .number()
    .optional()
    .describe(
      'Model confidence from 0 to 1 that this flag is material enough to require owner action. Medium flags should be at least 0.78; high flags at least 0.65.',
    ),
  suggestedAction: z
    .string()
    .optional()
    .describe('What the reviewer should approve, verify, or fix.'),
  anchorText: z
    .string()
    .optional()
    .describe('Nearby report text where the UI should jump for review.'),
});

const recordRefSchema = z.object({
  type: z.literal('record_ref'),
  targetRecordId: z
    .number()
    .int()
    .positive()
    .describe('Evidence record id supporting the finding.'),
  quote: z
    .string()
    .nullable()
    .optional()
    .describe('Exact quote from the record when available.'),
  location: z
    .string()
    .nullable()
    .optional()
    .describe('Page, section, row, or other source location when available.'),
});

const findingSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe('A factual finding stated in reportMarkdown.'),
  findingType: z.string().describe('Finding type label.'),
  confidence: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('Confidence from 0 to 100.'),
  refs: z
    .array(recordRefSchema)
    .optional()
    .describe(
      'Evidence record refs supporting this finding. Use recordId values from the memo.',
    ),
});

const outputSchema = z.object({
  reportMarkdown: z
    .string()
    .min(1)
    .describe(
      'Public-facing report markdown only. Do not include internal document names, filenames, page references, citation labels, or source footnotes.',
    ),
  reviewFlags: z
    .array(reviewFlagSchema)
    .optional()
    .describe(
      'Structured review flags for warnings, approvals, and evidence gaps.',
    ),
  findings: z
    .array(findingSchema)
    .optional()
    .describe(
      'Important factual findings from the report, with record refs where valid.',
    ),
});

const POLICY = [
  'You are a municipal reporting assistant producing public-facing facilities maintenance audit summaries.',
  'Summaries must be evidence-backed: every material factual statement must be supported by the evidence memo provided by the user, referenced by recordId in the findings array. Never pad weak evidence into a confident statement.',
  'Confidentiality: reportMarkdown is public-facing and must never name internal source documents, filenames, page references, citation labels, or source footnotes. Keep all source attribution in findings and reviewFlags.sourceRefs only.',
  'Tone: measured, institutional, specific. Prefer concrete figures with as-of dates over generalities. British English.',
].join('\n\n');

function standingFacts(): string {
  const facts: string[] = [];
  for (let i = 1; i <= 38; i++) {
    facts.push(
      `- [recordId ${1000 + i}] Standing fact ${i}: District ${(i % 4) + 1} maintains ${120 + (i % 40)} registered facilities across ${3 + (i % 5)} asset classes with a target inspection cycle of ${8 + (i % 6)}–${11 + (i % 6)} weeks and a backlog ceiling of ${55 + (i % 10)} open work orders, measured quarterly as at Q${(i % 4) + 1} 202${4 + (i % 2)}. Programme-level limits cap any single facility at ${4 + (i % 3)}% of the annual budget and any single asset class at ${18 + (i % 7)}%.`,
    );
  }
  return `Standing verified facts (cite by recordId where used):\n${facts.join('\n')}`;
}

function evidenceMemo(seed: number): string {
  const paragraphs: string[] = [];
  for (let i = 1; i <= 22; i++) {
    const recordId = 2000 + seed * 100 + i;
    paragraphs.push(
      `Evidence ${i} [recordId ${recordId}]: The district completed ${10 + ((seed + i) % 9)} scheduled inspections in 202${3 + (i % 3)} covering ${(200 + ((seed * i) % 900)).toFixed(0)} assets at an average turnaround of ${6 + ((seed + i) % 5)}.${(seed + i) % 10} days. Closed work orders achieved a first-fix rate of ${63 + ((seed + i) % 26)}% with zero safety incidents in the period; one site (Site ${String.fromCharCode(65 + ((seed + i) % 26))}) remains on the watchlist following a structural survey, with remediation estimated at ${85 + ((seed + i) % 12)}% complete. Quarterly condition ratings are produced by an independent surveyor and reviewed by the audit committee.`,
    );
  }
  return [
    'Internal evidence memo from the records-gathering phase:',
    ...paragraphs,
    'EVIDENCE VERDICT: partial — district-specific pipeline data beyond Q2 is not yet in the evidence base; programme-level and prior-year evidence supports the remainder.',
  ].join('\n\n');
}

function userPrompt(seed: number): string {
  return [
    'Question 3.2: Describe the current maintenance backlog by asset class, district, installation vintage, criticality, and concentration, including watchlist sites and inspection governance.',
    evidenceMemo(seed),
    'Write the final public-facing summary from the evidence memo. Do not call tools. The evidence memo contains the only internal evidence you may use.',
    "Honor the memo's EVIDENCE VERDICT, but prefer a grounded partial summary over a bail. If 'partial', cover every part the memo supports in clean prose, and raise at most one reviewFlag for any specific detail the memo lacks.",
    'Return findings for the material factual and metric assertions in reportMarkdown — most important first, at most 12. Each finding must include a record_ref with targetRecordId set to a recordId listed in the memo or the standing facts, quote set to an exact substring from the cited excerpt where possible.',
    'Structured output contract: return exactly one object with reportMarkdown as markdown text, and reviewFlags and findings as arrays. Use empty arrays when there are no flags or findings. Do not wrap the object in prose, markdown fences, or labels.',
  ].join('\n\n');
}

const system = `${POLICY}\n\n${standingFacts()}`;

function responseText(response: BedrockResponse): string {
  return (
    response.output?.message?.content?.map(part => part.text ?? '').join('') ??
    ''
  );
}

function countZeroWidthSpaces(text: string): number {
  return (text.match(/\u200B/g) ?? []).length;
}

async function runNative(seed: number) {
  const callIndex = recordedCalls.length;

  try {
    const result = await generateText({
      model: bedrock(MODEL_ID),
      output: Output.object({ schema: outputSchema }),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt(seed) },
      ],
      allowSystemInMessages: true,
      maxOutputTokens: NATIVE_MAX_OUTPUT_TOKENS,
      maxRetries: 1,
    });
    void result.output;
    const call = recordedCalls[callIndex];
    const rawText = responseText(call.response);
    const degenerate =
      result.finishReason === 'length' ||
      result.usage.outputTokens === NATIVE_MAX_OUTPUT_TOKENS ||
      countZeroWidthSpaces(rawText) > 0;

    console.log(
      `native run ${seed}: finish=${result.finishReason} outputTokens=${result.usage.outputTokens} U+200B=${countZeroWidthSpaces(rawText)}`,
    );
    return { call, degenerate };
  } catch (error) {
    const call = recordedCalls[callIndex];
    const rawText = responseText(call.response);
    const outputTokens = call.response.usage?.outputTokens ?? -1;
    const degenerate =
      call.response.stopReason === 'max_tokens' ||
      outputTokens === NATIVE_MAX_OUTPUT_TOKENS ||
      countZeroWidthSpaces(rawText) > 0;

    console.log(
      `native run ${seed}: error=${error instanceof Error ? error.name : String(error)} providerStop=${call.response.stopReason} outputTokens=${outputTokens} U+200B=${countZeroWidthSpaces(rawText)}`,
    );
    return { call, degenerate };
  }
}

async function runJsonTool() {
  const callIndex = recordedCalls.length;
  const result = await generateText({
    model: bedrock(MODEL_ID),
    tools: {
      json: tool({
        description: 'Respond with a JSON object.',
        inputSchema: outputSchema,
      }),
    },
    toolChoice: 'required',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt(1) },
    ],
    allowSystemInMessages: true,
    maxOutputTokens: TOOL_MAX_OUTPUT_TOKENS,
    maxRetries: 1,
  });
  const call = recordedCalls[callIndex];
  const parsed = result.toolCalls.some(
    toolCall => toolCall.toolName === 'json',
  );
  const degenerate =
    result.finishReason === 'length' ||
    result.usage.outputTokens === TOOL_MAX_OUTPUT_TOKENS ||
    !parsed;

  console.log(
    `json-tool run: finish=${result.finishReason} outputTokens=${result.usage.outputTokens} parsed=${parsed}`,
  );
  return { call, degenerate };
}

async function main() {
  console.log(
    `model=${MODEL_ID} region=${REGION} systemChars=${system.length} userChars=${userPrompt(1).length}`,
  );

  let failedNativeCall: RecordedCall | undefined;
  for (let seed = 1; seed <= MAX_NATIVE_RUNS; seed++) {
    const result = await runNative(seed);
    if (result.degenerate) {
      failedNativeCall = result.call;
      break;
    }
  }

  const toolResult = await runJsonTool();

  if (failedNativeCall != null && process.env.RECORD_FIXTURE === '1') {
    await writeFile(
      LIVE_FIXTURE_WRITE_PATH,
      `${JSON.stringify(failedNativeCall.response, null, 2)}\n`,
    );
    console.log(
      `recorded live response fixture: ${LIVE_FIXTURE_REPOSITORY_PATH}`,
    );
  }

  const nativeRequest = failedNativeCall?.request as {
    additionalModelRequestFields?: {
      output_config?: { format?: { type?: string } };
    };
    toolConfig?: unknown;
  };
  const toolRequest = toolResult.call.request as {
    additionalModelRequestFields?: {
      output_config?: { format?: { type?: string } };
    };
    toolConfig?: { toolChoice?: unknown };
  };

  console.log(
    `native wire: outputFormat=${nativeRequest?.additionalModelRequestFields?.output_config?.format?.type ?? 'none'} toolConfig=${nativeRequest?.toolConfig == null ? 'none' : 'present'}`,
  );
  console.log(
    `tool wire: outputFormat=${toolRequest.additionalModelRequestFields?.output_config?.format?.type ?? 'none'} toolChoice=${JSON.stringify(toolRequest.toolConfig?.toolChoice)}`,
  );

  if (failedNativeCall != null && !toolResult.degenerate) {
    console.error(
      'ISSUE_17881_REPRODUCED: native structured output hit the token cap while the JSON tool completed normally',
    );
    process.exitCode = 1;
    return;
  }

  if (failedNativeCall == null) {
    console.log(
      `ISSUE_17881_NOT_REPRODUCED: ${MAX_NATIVE_RUNS} native runs completed without the reported degeneration`,
    );
    return;
  }

  console.log(
    'ISSUE_17881_INCONCLUSIVE: native structured output degenerated, but the JSON tool comparison did not complete normally',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
