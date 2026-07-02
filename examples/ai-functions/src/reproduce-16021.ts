import { openai } from '@ai-sdk/openai';
import {
  streamText,
  tool,
  wrapLanguageModel,
  type LanguageModelMiddleware,
} from 'ai';
import { z } from 'zod/v4';

type TrialResult = {
  label: string;
  ok: boolean;
  sawInProgress: boolean;
  errorType?: string;
  errorCode?: string;
  errorMessage?: string;
  requestId?: string;
  responseId?: string;
  patternCount?: number;
  durationMs: number;
};

const stripJsonSchemaPatternsMiddleware: LanguageModelMiddleware = {
  transformParams: async ({ params }) => ({
    ...params,
    tools: params.tools?.map(tool =>
      tool.type === 'function'
        ? { ...tool, inputSchema: stripPatternKeywordDeep(tool.inputSchema) }
        : tool,
    ),
    responseFormat:
      params.responseFormat?.type === 'json' && params.responseFormat.schema
        ? {
            ...params.responseFormat,
            schema: stripPatternKeywordDeep(params.responseFormat.schema),
          }
        : params.responseFormat,
  }),
};

function stripPatternKeywordDeep<T>(schema: T): T {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (node === null || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'pattern' && typeof value === 'string') continue;
      if (
        ['properties', 'patternProperties', '$defs', 'definitions'].includes(
          key,
        ) &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        out[key] = Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, visit(v)]),
        );
        continue;
      }
      out[key] = visit(value);
    }
    return out;
  };
  return visit(schema) as T;
}

function countPatternKeywords(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((n, v) => n + countPatternKeywords(v), 0);
  if (value === null || typeof value !== 'object') return 0;
  return Object.entries(value).reduce(
    (n, [key, child]) => n + (key === 'pattern' ? 1 : 0) + countPatternKeywords(child),
    0,
  );
}

const longDescription = `Use this tool only when the conversation clearly requires a persisted family operations change. Validate all identifiers and dates carefully. The backend accepts ISO date strings, UUID primary keys, and email addresses for contacts. Prefer asking a clarification question if any supplied value is ambiguous. This description is intentionally verbose to make the aggregate tool grammar similar to large production schemas.`;

function makeTool(index: number) {
  const base = z.object({
    requestId: z.uuid().describe('Stable request id for idempotency.'),
    guardianEmail: z.email().describe('Email address for the legal guardian.'),
    childId: z.uuid().describe('Child profile UUID.'),
    birthDate: z.iso.date().describe('Child birth date in YYYY-MM-DD format.'),
    effectiveDate: z.iso.date().describe('Date the requested change should begin.'),
    note: z.string().min(1).max(400).describe('Human-readable note.'),
    category: z.enum(['school', 'medical', 'travel', 'billing', 'safety']),
    tags: z.array(z.string().min(1).max(32)).max(8),
    contact: z.object({
      email: z.email(),
      backupEmail: z.email().optional(),
      userId: z.uuid(),
    }),
  });

  return tool({
    description: `${longDescription} Tool number ${index} updates one bounded slice of the family workspace and returns a compact audit record.`,
    inputSchema: base,
    execute: async input => ({ ok: true, index, input }),
  });
}

const tools = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [`family_tool_${i + 1}`, makeTool(i + 1)]),
);

const caseNotes = Array.from({ length: 90 }, (_, i) => {
  const day = String((i % 28) + 1).padStart(2, '0');
  return `Case note ${i + 1}: guardian-${i}@example.com asked whether child ${i % 7} can have a schedule adjustment on 2026-08-${day}; do not call tools unless a concrete mutation is requested.`;
}).join('\n');

const messages = [
  {
    role: 'user' as const,
    content: `We manage a family support workspace. Here is the current thread context.\n${caseNotes}`,
  },
  {
    role: 'assistant' as const,
    content:
      'I can help review the thread and identify whether any family workspace tool needs to be called.',
  },
  {
    role: 'user' as const,
    content:
      'Before making changes, summarize the likely next action. Do not call a tool unless absolutely necessary.',
  },
  {
    role: 'assistant' as const,
    content:
      'No tool call is necessary yet because the request is asking for a summary rather than a mutation.',
  },
  {
    role: 'user' as const,
    content:
      'Please provide a two sentence summary of why no tool call is needed right now.',
  },
];

async function runTrial(label: string, stripPatterns: boolean): Promise<TrialResult> {
  const start = Date.now();
  const result = streamText({
    model: stripPatterns
      ? wrapLanguageModel({
          model: openai.responses('gpt-5.4'),
          middleware: stripJsonSchemaPatternsMiddleware,
        })
      : openai.responses('gpt-5.4'),
    messages,
    system:
      'You are a concise assistant. You have many tools but should not call them unless the user explicitly asks for a state change. Answer briefly.',
    tools,
    maxRetries: 0,
    maxOutputTokens: 64,
    include: { requestBody: true, rawChunks: true },
    providerOptions: { openai: { store: false } },
  });

  let sawInProgress = false;
  let responseId: string | undefined;
  let requestId: string | undefined;
  let patternCount: number | undefined;
  let errorType: string | undefined;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;

  try {
    for await (const part of result.fullStream) {
      if (part.type === 'start-step') {
        patternCount = countPatternKeywords(part.request.body);
      }
      if (part.type === 'raw') {
        const raw = part.rawValue as any;
        if (raw?.type === 'response.in_progress') sawInProgress = true;
        if (raw?.response?.id) responseId = raw.response.id;
        if (raw?.type === 'error') {
          errorType = raw.error?.type;
          errorCode = raw.error?.code;
          errorMessage = raw.error?.message;
        }
      }
      if (part.type === 'finish-step') {
        const headers = part.response.headers as Record<string, string> | undefined;
        requestId = headers?.['x-request-id'];
      }
      if (part.type === 'error') {
        const err = part.error as any;
        errorType ||= err?.type ?? err?.name;
        errorCode ||= err?.code;
        errorMessage ||= err?.message ?? String(part.error);
      }
    }
    return {
      label,
      ok: errorType == null,
      sawInProgress,
      responseId,
      requestId,
      patternCount,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const err = error as any;
    return {
      label,
      ok: false,
      sawInProgress,
      responseId,
      requestId,
      patternCount,
      errorType: errorType ?? err?.type ?? err?.name,
      errorCode: errorCode ?? err?.code,
      errorMessage: errorMessage ?? err?.message ?? String(error),
      durationMs: Date.now() - start,
    };
  }
}

async function main() {
  const trials = Number(process.env.TRIALS ?? '4');
  const includeStripped = process.env.INCLUDE_STRIPPED !== '0';
  const results: TrialResult[] = [];

  for (let i = 1; i <= trials; i++) {
    const result = await runTrial(`with-patterns-${i}`, false);
    results.push(result);
    console.log(JSON.stringify(result));
  }

  if (includeStripped) {
    for (let i = 1; i <= Math.min(trials, 2); i++) {
      const result = await runTrial(`stripped-patterns-${i}`, true);
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }

  const serverErrors = results.filter(
    r => r.errorType === 'server_error' || r.errorCode === 'server_error',
  );
  console.log(
    JSON.stringify({
      summary: {
        total: results.length,
        failures: results.filter(r => !r.ok).length,
        serverErrors: serverErrors.length,
        withPatternPatternCounts: results
          .filter(r => r.label.startsWith('with-patterns'))
          .map(r => r.patternCount),
        strippedPatternCounts: results
          .filter(r => r.label.startsWith('stripped'))
          .map(r => r.patternCount),
      },
    }),
  );

  if (serverErrors.length > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
