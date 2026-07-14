import {
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  stepCountIs,
  tool,
} from 'ai';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { AmazonBedrockChatLanguageModel } from '../../../../packages/amazon-bedrock/src/amazon-bedrock-chat-language-model';
import {
  createApiKeyFetchFunction,
  createSigV4FetchFunction,
} from '../../../../packages/amazon-bedrock/src/amazon-bedrock-sigv4-fetch';

const modelId = 'us.anthropic.claude-opus-4-8';
// The current main branch incorrectly selects output_config.format for the real
// model ID, which Bedrock rejects before reaching issue #16662. This alias makes
// the current provider select the synthetic JSON-tool path used by the reported
// @ai-sdk/amazon-bedrock@4.0.120 release. The fetch wrapper below replaces the
// alias with the real model ID before authenticating and sending the request.
const providerModelId = 'us.anthropic.claude-opus48-issue-16662';
const region = 'us-east-1';
const runCount = Number(process.env.ISSUE_16662_RUNS ?? 5);
const pageCount = Number(process.env.ISSUE_16662_PAGES ?? 6);
const payloadKilobytes = Number(process.env.ISSUE_16662_PAYLOAD_KB ?? 8);
const capturePath = process.env.ISSUE_16662_CAPTURE_PATH;

type CapturedCall = {
  url: string;
  request: {
    messageCount?: number;
    lastMessageRole?: string;
    lastMessageBytes?: number;
    toolChoice?: unknown;
    toolNames?: string[];
  };
  response: unknown;
  status: number;
};

type CapturedRun = {
  run: number;
  outcome:
    | 'success'
    | 'no-object-generated'
    | 'no-output-generated'
    | 'other-error';
  calls: CapturedCall[];
  error?: {
    name: string;
    message: string;
  };
  result?: {
    output: unknown;
    steps: Array<{
      finishReason: string;
      inputTokens: number | undefined;
      outputTokens: number | undefined;
      stepNumber: number;
      textLength: number;
      toolNames: string[];
    }>;
    usage: unknown;
  };
};

function createNoisyPayload({
  page,
  source,
}: {
  page: number;
  source: 'logs' | 'records';
}) {
  const targetBytes = payloadKilobytes * 1024;
  const lines: string[] = [];

  for (let row = 0; lines.join('\n').length < targetBytes; row++) {
    const sequence = page * 100_000 + row;
    const hash = ((sequence * 2_654_435_761) >>> 0)
      .toString(16)
      .padStart(8, '0');

    if (source === 'records') {
      lines.push(
        [
          `${sequence}|acct_${hash}|tenant_${sequence % 97}`,
          `status=${row % 11 === 0 ? 'REVIEW' : 'ACTIVE'}`,
          `policy=P-${(sequence * 17) % 10_000}`,
          `amount=${((sequence % 50_000) / 100).toFixed(2)}`,
          `metadata={"region":"us-east-1","trace":"${hash}-${sequence}","flags":["imported","semi_structured"]}`,
        ].join('|'),
      );
    } else {
      lines.push(
        [
          `2026-07-${String((row % 14) + 1).padStart(2, '0')}T12:${String(
            row % 60,
          ).padStart(2, '0')}:${String((row * 7) % 60).padStart(2, '0')}.000Z`,
          `host=worker-${sequence % 43}`,
          `level=${row % 13 === 0 ? 'WARN' : 'INFO'}`,
          `trace_id=${hash}${sequence.toString(16)}`,
          `command="reconcile --account acct_${hash} --page ${page}"`,
          `result={"matched":${sequence % 19},"skipped":${sequence % 5},"note":"raw multiline command output"}`,
        ].join(' '),
      );
    }
  }

  return lines.join('\n').slice(0, targetBytes);
}

function summarizeRequest(body: unknown): CapturedCall['request'] {
  if (body == null || typeof body !== 'object') {
    return {};
  }

  const request = body as {
    messages?: unknown[];
    toolConfig?: {
      toolChoice?: unknown;
      tools?: Array<{ toolSpec?: { name?: string } }>;
    };
  };
  const lastMessage = request.messages?.at(-1);

  return {
    messageCount: request.messages?.length,
    lastMessageRole:
      lastMessage != null &&
      typeof lastMessage === 'object' &&
      'role' in lastMessage
        ? String(lastMessage.role)
        : undefined,
    lastMessageBytes:
      lastMessage == null ? undefined : JSON.stringify(lastMessage).length,
    toolChoice: request.toolConfig?.toolChoice,
    toolNames: request.toolConfig?.tools
      ?.map(tool => tool.toolSpec?.name)
      .filter((name): name is string => name != null),
  };
}

function asError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'UnknownError', message: String(error) };
}

function requireEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (value == null || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

async function main() {
  const calls: CapturedCall[] = [];
  const captureFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestBody =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as unknown)
        : undefined;
    const response = await fetch(input, init);
    const responseBody = await response
      .clone()
      .json()
      .catch(async () => await response.clone().text());

    calls.push({
      url: input instanceof Request ? input.url : String(input),
      request: summarizeRequest(requestBody),
      response: responseBody,
      status: response.status,
    });

    return response;
  };
  const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK?.trim();
  const authenticatedFetch =
    apiKey != null && apiKey !== ''
      ? createApiKeyFetchFunction(apiKey, captureFetch)
      : createSigV4FetchFunction(
          async () => ({
            accessKeyId: requireEnvironmentVariable('AWS_ACCESS_KEY_ID'),
            region,
            secretAccessKey: requireEnvironmentVariable(
              'AWS_SECRET_ACCESS_KEY',
            ),
            sessionToken: process.env.AWS_SESSION_TOKEN,
          }),
          captureFetch,
        );
  let generatedId = 0;
  const model = new AmazonBedrockChatLanguageModel(providerModelId, {
    baseUrl: () => `https://bedrock-runtime.${region}.amazonaws.com`,
    fetch: async (input, init) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      );
      url.pathname = url.pathname.replace(
        encodeURIComponent(providerModelId),
        encodeURIComponent(modelId),
      );
      return authenticatedFetch(url, init);
    },
    generateId: () => `issue-16662-${generatedId++}`,
    headers: {},
  });

  const capturedRuns: CapturedRun[] = [];
  let noObjectGeneratedFailures = 0;
  let noOutputGeneratedFailures = 0;
  let otherFailures = 0;

  for (let run = 1; run <= runCount; run++) {
    const firstCall = calls.length;

    try {
      const result = await generateText({
        model,
        output: Output.object({
          schema: z.object({
            reasoning: z.string(),
            requirements: z.array(
              z.object({
                id: z.string(),
                priority: z.enum(['high', 'medium', 'low']),
                summary: z.string(),
              }),
            ),
            riskLevel: z.enum(['critical', 'high', 'medium', 'low']),
          }),
        }),
        tools: {
          queryRecords: tool({
            description:
              'Read one page of verbose warehouse query rows for the investigation.',
            inputSchema: z.object({
              page: z.number().int().min(1).max(pageCount),
            }),
            execute: async ({ page }) => ({
              page,
              payload: createNoisyPayload({ page, source: 'records' }),
              source: 'warehouse-query',
              nextAction:
                page < pageCount
                  ? `After also reading log page ${page}, continue with page ${page + 1}.`
                  : `After also reading log page ${page}, all evidence has been collected.`,
            }),
          }),
          readLogs: tool({
            description:
              'Read one page of verbose multiline command and service logs for the investigation.',
            inputSchema: z.object({
              page: z.number().int().min(1).max(pageCount),
            }),
            execute: async ({ page }) => ({
              page,
              payload: createNoisyPayload({ page, source: 'logs' }),
              source: 'service-logs',
              nextAction:
                page < pageCount
                  ? `After also reading warehouse page ${page}, continue with page ${page + 1}.`
                  : `After also reading warehouse page ${page}, all evidence has been collected.`,
            }),
          }),
        },
        stopWhen: stepCountIs(15),
        include: {
          responseBody: true,
        },
        prompt: [
          'Investigate a production reconciliation incident and return the final structured assessment.',
          `You must collect every evidence page from 1 through ${pageCount} before answering.`,
          'For each page, call both queryRecords and readLogs with that page number.',
          'Process pages in ascending order. You may call the two tools for the same page together.',
          'Do not produce the final answer until both tools have returned every requested page.',
          'The tool payloads are intentionally large, noisy, multiline, and semi-structured.',
        ].join('\n'),
      });

      // Accessing output is the primary assertion: the reported bug throws here.
      const output = result.output;

      capturedRuns.push({
        run,
        outcome: 'success',
        calls: calls.slice(firstCall),
        result: {
          output,
          steps: result.steps.map(step => ({
            finishReason: step.finishReason,
            inputTokens: step.usage.inputTokens,
            outputTokens: step.usage.outputTokens,
            stepNumber: step.stepNumber,
            textLength: step.text.length,
            toolNames: step.toolCalls.map(toolCall => toolCall.toolName),
          })),
          usage: result.usage,
        },
      });

      console.log(
        `run ${run}/${runCount}: success, steps=${result.steps.length}, ` +
          `finalInputTokens=${result.finalStep.usage.inputTokens}, ` +
          `tools=${result.steps
            .flatMap(step => step.toolCalls.map(call => call.toolName))
            .join(',')}`,
      );
    } catch (error) {
      const noObjectGenerated = NoObjectGeneratedError.isInstance(error);
      const noOutputGenerated = NoOutputGeneratedError.isInstance(error);
      noObjectGeneratedFailures += noObjectGenerated ? 1 : 0;
      noOutputGeneratedFailures += noOutputGenerated ? 1 : 0;
      otherFailures += noObjectGenerated || noOutputGenerated ? 0 : 1;

      capturedRuns.push({
        run,
        outcome: noObjectGenerated
          ? 'no-object-generated'
          : noOutputGenerated
            ? 'no-output-generated'
            : 'other-error',
        calls: calls.slice(firstCall),
        error: asError(error),
      });

      console.error(
        `run ${run}/${runCount}: ${
          noObjectGenerated
            ? 'NO OBJECT GENERATED'
            : noOutputGenerated
              ? 'NO OUTPUT GENERATED'
              : 'OTHER ERROR'
        }`,
        error,
      );
    }
  }

  if (capturePath != null) {
    await writeFile(
      capturePath,
      `${JSON.stringify(
        {
          issue: 16662,
          modelId,
          region,
          configuration: {
            pageCount,
            payloadKilobytes,
            runCount,
          },
          providerModelId,
          runs: capturedRuns,
        },
        null,
        2,
      )}\n`,
    );
  }

  console.log(
    JSON.stringify(
      {
        noObjectGeneratedFailures,
        noOutputGeneratedFailures,
        otherFailures,
        runCount,
      },
      null,
      2,
    ),
  );

  if (otherFailures > 0) {
    throw new Error(`${otherFailures} run(s) failed for an unrelated reason.`);
  }

  if (noObjectGeneratedFailures + noOutputGeneratedFailures > 0) {
    throw new Error(
      `Reproduced issue #16662 in ${
        noObjectGeneratedFailures + noOutputGeneratedFailures
      }/${runCount} run(s).`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
