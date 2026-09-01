import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { streamText } from '../../../../packages/ai/src/generate-text/stream-text';
import type { ToolSet } from '../../../../packages/ai/src/generate-text/tool-set';
import { createOpenAICompatible } from '../../../../packages/openai-compatible/src';
import { createOpenAI } from '../../../../packages/openai/src';
import {
  jsonSchema,
  safeParseJSON,
  tool,
  type FetchFunction,
} from '../../../../packages/provider-utils/src';

/**
 * Live end-to-end reproduction for https://github.com/vercel/ai/issues/18440.
 *
 * Required:
 *   AI_SDK_ISSUE_18440_MODEL=<installed-tool-capable-model>
 *
 * Optional:
 *   AI_SDK_ISSUE_18440_BASE_URL=http://localhost:11434/v1
 *   AI_SDK_ISSUE_18440_API_KEY=ollama
 *   AI_SDK_ISSUE_18440_PROVIDER=openai-compatible # or openai
 *
 * The request body, raw SSE response, provider raw chunks, and comparison summary
 * are saved under examples/ai-functions/output. Authentication headers are never
 * recorded.
 */

type ProviderKind = 'openai-compatible' | 'openai';

type CapturedExchange = {
  url: string;
  method: string;
  requestBody?: string;
  responseStatus?: number;
  responseContentType?: string | null;
  responseBody?: string;
  responseBodyError?: string;
  fetchError?: string;
};

type WireToolCallDelta = {
  eventNumber: number;
  choiceIndex: unknown;
  position: number;
  indexPresent: boolean;
  index: unknown;
  idPresent: boolean;
  id: unknown;
  namePresent: boolean;
  name: unknown;
  argumentsPresent: boolean;
  arguments: unknown;
};

type EmittedToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

const outputDirectory = resolve(__dirname, '../../output');
const artifactPrefix = 'issue-18440';

const tools = {
  read_file: tool({
    description: 'Read a text file.',
    inputSchema: jsonSchema<{ path: string }>({
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    }),
  }),
  write_file: tool({
    description: 'Write text to a file.',
    inputSchema: jsonSchema<{ path: string; content: string }>({
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    }),
  }),
  list_directory: tool({
    description: 'List the entries in a directory.',
    inputSchema: jsonSchema<{ path: string }>({
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    }),
  }),
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isUsableString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    return url.href;
  } catch {
    return '<invalid URL>';
  }
}

function getProviderKind(): ProviderKind {
  const value = process.env.AI_SDK_ISSUE_18440_PROVIDER ?? 'openai-compatible';

  if (value !== 'openai-compatible' && value !== 'openai') {
    throw new Error(
      'AI_SDK_ISSUE_18440_PROVIDER must be "openai-compatible" or "openai".',
    );
  }

  return value;
}

function getModelId(): string {
  const modelId = process.env.AI_SDK_ISSUE_18440_MODEL?.trim();

  if (!modelId) {
    throw new Error(
      [
        'AI_SDK_ISSUE_18440_MODEL is required.',
        'Example:',
        'AI_SDK_ISSUE_18440_MODEL=<installed-tool-capable-model> pnpm -C examples/ai-functions exec tsx src/reproduction/issue-18440-streamed-tool-call-id.ts',
      ].join('\n'),
    );
  }

  return modelId;
}

function createCapturingFetch({
  exchanges,
  responseCaptures,
}: {
  exchanges: CapturedExchange[];
  responseCaptures: Promise<void>[];
}): FetchFunction {
  return async (input, init) => {
    const exchange: CapturedExchange = {
      url: sanitizeUrl(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      ),
      method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
      ...(typeof init?.body === 'string' && { requestBody: init.body }),
    };
    exchanges.push(exchange);

    let response: Response;
    try {
      response = await globalThis.fetch(input, init);
    } catch (error) {
      exchange.fetchError = errorMessage(error);
      throw error;
    }

    exchange.responseStatus = response.status;
    exchange.responseContentType = response.headers.get('content-type');

    responseCaptures.push(
      response
        .clone()
        .text()
        .then(body => {
          exchange.responseBody = body;
        })
        .catch(error => {
          exchange.responseBodyError = errorMessage(error);
        }),
    );

    return response;
  };
}

async function extractWireToolCallDeltas(
  responseBodies: string[],
): Promise<WireToolCallDelta[]> {
  const result: WireToolCallDelta[] = [];
  let eventNumber = 0;

  for (const responseBody of responseBodies) {
    for (const event of responseBody.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n');

      if (!data || data === '[DONE]') {
        continue;
      }

      eventNumber += 1;
      const parsed = await safeParseJSON({ text: data });
      if (!parsed.success || !isRecord(parsed.value)) {
        continue;
      }

      const choices = parsed.value.choices;
      if (!Array.isArray(choices)) {
        continue;
      }

      for (const choice of choices) {
        if (!isRecord(choice) || !isRecord(choice.delta)) {
          continue;
        }

        const toolCalls = choice.delta.tool_calls;
        if (!Array.isArray(toolCalls)) {
          continue;
        }

        for (const [position, toolCall] of toolCalls.entries()) {
          if (!isRecord(toolCall)) {
            continue;
          }

          const fn = isRecord(toolCall.function) ? toolCall.function : {};
          result.push({
            eventNumber,
            choiceIndex: choice.index,
            position,
            indexPresent: hasOwn(toolCall, 'index'),
            index: toolCall.index,
            idPresent: hasOwn(toolCall, 'id'),
            id: toolCall.id,
            namePresent: hasOwn(fn, 'name'),
            name: fn.name,
            argumentsPresent: hasOwn(fn, 'arguments'),
            arguments: fn.arguments,
          });
        }
      }
    }
  }

  return result;
}

function findConflictingDuplicateIds(
  deltas: WireToolCallDelta[],
): Array<{ id: string; first: number; second: number }> {
  const namedDeltas = deltas.filter(delta => isUsableString(delta.name));
  const duplicates: Array<{ id: string; first: number; second: number }> = [];

  for (let first = 0; first < namedDeltas.length; first += 1) {
    for (let second = first + 1; second < namedDeltas.length; second += 1) {
      const left = namedDeltas[first];
      const right = namedDeltas[second];

      if (
        isUsableString(left.id) &&
        left.id === right.id &&
        (left.index !== right.index || left.name !== right.name)
      ) {
        duplicates.push({ id: left.id, first, second });
      }
    }
  }

  return duplicates;
}

function createModel({
  providerKind,
  baseURL,
  modelId,
  apiKey,
  fetch,
}: {
  providerKind: ProviderKind;
  baseURL: string;
  modelId: string;
  apiKey: string;
  fetch: FetchFunction;
}) {
  if (providerKind === 'openai') {
    return createOpenAI({
      apiKey,
      baseURL,
      name: 'issue-18440',
      fetch,
    }).chat(modelId);
  }

  return createOpenAICompatible({
    apiKey,
    baseURL,
    name: 'issue-18440',
    fetch,
  }).chatModel(modelId);
}

async function writeArtifacts({
  exchanges,
  rawChunks,
  summary,
}: {
  exchanges: CapturedExchange[];
  rawChunks: unknown[];
  summary: unknown;
}) {
  await mkdir(outputDirectory, { recursive: true });

  const request = exchanges[0]?.requestBody ?? '';
  const response = exchanges[0]?.responseBody ?? '';
  const rawChunkLines = rawChunks
    .map(chunk => JSON.stringify(chunk))
    .join('\n');

  await Promise.all([
    writeFile(`${outputDirectory}/${artifactPrefix}-request.json`, request),
    writeFile(`${outputDirectory}/${artifactPrefix}-response.sse`, response),
    writeFile(
      `${outputDirectory}/${artifactPrefix}-raw-chunks.jsonl`,
      rawChunkLines,
    ),
    writeFile(
      `${outputDirectory}/${artifactPrefix}-summary.json`,
      `${JSON.stringify(summary, null, 2)}\n`,
    ),
  ]);
}

async function main() {
  const providerKind = getProviderKind();
  const modelId = getModelId();
  const baseURL =
    process.env.AI_SDK_ISSUE_18440_BASE_URL ?? 'http://localhost:11434/v1';
  const apiKey = process.env.AI_SDK_ISSUE_18440_API_KEY ?? 'ollama';
  const exchanges: CapturedExchange[] = [];
  const responseCaptures: Promise<void>[] = [];
  const rawChunks: unknown[] = [];
  const emittedToolCalls: EmittedToolCall[] = [];
  const sdkErrors: string[] = [];

  const model = createModel({
    providerKind,
    baseURL,
    modelId,
    apiKey,
    fetch: createCapturingFetch({ exchanges, responseCaptures }),
  });

  try {
    const result = streamText({
      model,
      maxRetries: 0,
      maxOutputTokens: 512,
      temperature: 0,
      tools: tools as unknown as ToolSet,
      toolChoice: 'required',
      includeRawChunks: true,
      prompt: [
        'Call all three available tools exactly once in this single assistant turn.',
        'Make the calls in parallel if supported:',
        '- read_file with path "alpha.txt"',
        '- write_file with path "beta.txt" and content "beta"',
        '- list_directory with path "."',
        'Do not call any tool twice and do not answer with text.',
      ].join('\n'),
    });

    for await (const chunk of result.fullStream) {
      switch (chunk.type) {
        case 'raw':
          rawChunks.push(chunk.rawValue);
          break;
        case 'tool-call':
          emittedToolCalls.push({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            input: chunk.input,
          });
          break;
        case 'error':
          sdkErrors.push(errorMessage(chunk.error));
          break;
      }
    }
  } catch (error) {
    sdkErrors.push(errorMessage(error));
  }

  await Promise.allSettled(responseCaptures);

  const wireToolCallDeltas = await extractWireToolCallDeltas(
    exchanges.flatMap(exchange =>
      exchange.responseBody == null ? [] : [exchange.responseBody],
    ),
  );
  const namedWireDeltas = wireToolCallDeltas.filter(delta =>
    isUsableString(delta.name),
  );
  const unusableIdOnNamedCall = namedWireDeltas.filter(
    delta => !isUsableString(delta.id),
  );
  const blankIds = wireToolCallDeltas.filter(
    delta => typeof delta.id === 'string' && delta.id.trim().length === 0,
  );
  const conflictingDuplicateIds =
    findConflictingDuplicateIds(wireToolCallDeltas);
  const requestedToolNames = Object.keys(tools);
  const observedNamedTools = new Set(
    namedWireDeltas.flatMap(delta =>
      isUsableString(delta.name) ? [delta.name] : [],
    ),
  );
  const exercisedRequestedParallelCalls = requestedToolNames.every(toolName =>
    observedNamedTools.has(toolName),
  );
  const invalidEmittedCalls = emittedToolCalls.filter(
    call => !isUsableString(call.toolCallId) || !isUsableString(call.toolName),
  );
  const missingEmittedCalls =
    namedWireDeltas.length > emittedToolCalls.length &&
    namedWireDeltas.length > 1;
  const wireHasClaimedIdentityProblem =
    unusableIdOnNamedCall.length > 0 ||
    blankIds.length > 0 ||
    conflictingDuplicateIds.length > 0;
  const sdkMishandledCalls =
    sdkErrors.length > 0 ||
    invalidEmittedCalls.length > 0 ||
    missingEmittedCalls;
  const reproduced = wireHasClaimedIdentityProblem && sdkMishandledCalls;
  const conclusive = reproduced || exercisedRequestedParallelCalls;

  const summary = {
    configuration: {
      providerKind,
      baseURL: sanitizeUrl(baseURL),
      modelId,
    },
    request: {
      exchangeCount: exchanges.length,
      exchanges: exchanges.map(exchange => ({
        url: exchange.url,
        method: exchange.method,
        responseStatus: exchange.responseStatus,
        responseContentType: exchange.responseContentType,
        responseBodyError: exchange.responseBodyError,
        fetchError: exchange.fetchError,
      })),
    },
    wireToolCallDeltas,
    emittedToolCalls,
    sdkErrors,
    evidence: {
      namedWireDeltaCount: namedWireDeltas.length,
      unusableIdOnNamedCallCount: unusableIdOnNamedCall.length,
      blankIdDeltaCount: blankIds.length,
      conflictingDuplicateIds,
      requestedToolNames,
      observedNamedTools: [...observedNamedTools],
      exercisedRequestedParallelCalls,
      invalidEmittedCallCount: invalidEmittedCalls.length,
      missingEmittedCalls,
      wireHasClaimedIdentityProblem,
      sdkMishandledCalls,
      conclusive,
      reproduced,
    },
  };

  await writeArtifacts({ exchanges, rawChunks, summary });
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Trace artifacts: ${outputDirectory}/${artifactPrefix}-*`);

  if (reproduced) {
    console.error(
      'ISSUE 18440 REPRODUCED: the live endpoint emitted unusable or conflicting tool-call IDs and the SDK did not preserve every call.',
    );
    process.exitCode = 1;
    return;
  }

  if (!conclusive) {
    console.error(
      "ISSUE 18440 INCONCLUSIVE: the live endpoint did not emit all three requested tool calls; inspect the saved trace and retry with the reporter's model and settings.",
    );
    process.exitCode = 2;
    return;
  }

  console.log(
    wireHasClaimedIdentityProblem
      ? 'ISSUE 18440 NOT REPRODUCED: the live endpoint emitted suspect identifiers, but this SDK run preserved the calls.'
      : 'ISSUE 18440 NOT REPRODUCED: the live endpoint did not emit the claimed unusable or conflicting tool-call IDs.',
  );
}

main().catch(error => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
