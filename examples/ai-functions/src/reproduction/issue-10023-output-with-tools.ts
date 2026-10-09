import 'dotenv/config';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import {
  APICallError,
  createGateway,
  generateText,
  Output,
  stepCountIs,
  tool,
  ToolLoopAgent,
  type LanguageModel,
} from 'ai';
import { z } from 'zod';

type CapturedCall = {
  requestBody?: unknown;
  responseBody?: unknown;
  status: number;
};

type ScenarioResult = {
  error?: {
    message: string;
    responseBody?: string;
    statusCode?: number;
  };
  output?: unknown;
  requestCount: number;
  requests: CapturedCall[];
  stepCount?: number;
  toolExecutionCount: number;
};

const outputSchema = z.object({
  date: z.literal('2026-09-04'),
  task: z.string(),
});

function createCapturingFetch(calls: CapturedCall[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);

    calls.push({
      requestBody:
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      responseBody: await response
        .clone()
        .json()
        .catch(() => undefined),
      status: response.status,
    });

    return response;
  };
}

async function runGenerateText(model: LanguageModel, calls: CapturedCall[]) {
  let toolExecutionCount = 0;

  try {
    const result = await generateText({
      model,
      output: Output.object({ schema: outputSchema }),
      prompt:
        'Use resolveDate exactly once for "tomorrow", then return the structured task "prepare the reproduction".',
      stopWhen: stepCountIs(5),
      tools: {
        resolveDate: tool({
          description: 'Resolve a relative date.',
          inputSchema: z.object({ expression: z.string() }),
          execute: async () => {
            toolExecutionCount++;
            return { date: '2026-09-04' };
          },
        }),
      },
    });

    return {
      output: result.output,
      requestCount: calls.length,
      requests: calls,
      stepCount: result.steps.length,
      toolExecutionCount,
    } satisfies ScenarioResult;
  } catch (error) {
    if (
      APICallError.isInstance(error) &&
      [401, 402, 403, 429].includes(error.statusCode ?? 0)
    ) {
      throw new Error(
        `Live-provider access blocker (${error.statusCode}): ${error.message}`,
      );
    }

    return {
      error: {
        message: error instanceof Error ? error.message : String(error),
        responseBody: APICallError.isInstance(error)
          ? error.responseBody
          : undefined,
        statusCode: APICallError.isInstance(error)
          ? error.statusCode
          : undefined,
      },
      requestCount: calls.length,
      requests: calls,
      toolExecutionCount,
    } satisfies ScenarioResult;
  }
}

async function runAgent(
  model: LanguageModel,
  calls: CapturedCall[],
  { stepScopedToolChoice = false }: { stepScopedToolChoice?: boolean } = {},
) {
  let toolExecutionCount = 0;

  const agent = new ToolLoopAgent({
    model,
    output: Output.object({ schema: outputSchema }),
    ...(stepScopedToolChoice
      ? {
          prepareStep: async ({ stepNumber }: { stepNumber: number }) => ({
            toolChoice:
              stepNumber === 0
                ? ({
                    type: 'tool',
                    toolName: 'resolveDate',
                  } as const)
                : ('auto' as const),
          }),
        }
      : {
          toolChoice: {
            type: 'tool' as const,
            toolName: 'resolveDate',
          },
        }),
    stopWhen: stepCountIs(5),
    tools: {
      resolveDate: tool({
        description: 'Resolve a relative date.',
        inputSchema: z.object({ expression: z.string() }),
        execute: async () => {
          toolExecutionCount++;
          return { date: '2026-09-04' };
        },
      }),
    },
  });

  try {
    const result = await agent.generate({
      prompt:
        'Use resolveDate exactly once for "tomorrow", then return the structured task "prepare the reproduction".',
    });

    return {
      output: result.output,
      requestCount: calls.length,
      requests: calls,
      stepCount: result.steps.length,
      toolExecutionCount,
    } satisfies ScenarioResult;
  } catch (error) {
    if (
      APICallError.isInstance(error) &&
      [401, 402, 403, 429].includes(error.statusCode ?? 0)
    ) {
      throw new Error(
        `Live-provider access blocker (${error.statusCode}): ${error.message}`,
      );
    }

    return {
      error: {
        message: error instanceof Error ? error.message : String(error),
        responseBody: APICallError.isInstance(error)
          ? error.responseBody
          : undefined,
        statusCode: APICallError.isInstance(error)
          ? error.statusCode
          : undefined,
      },
      requestCount: calls.length,
      requests: calls,
      toolExecutionCount,
    } satisfies ScenarioResult;
  }
}

function worked(result: ScenarioResult) {
  return (
    result.error == null &&
    outputSchema.safeParse(result.output).success &&
    result.toolExecutionCount > 0 &&
    (result.stepCount ?? 5) < 5
  );
}

function summarize(result: ScenarioResult) {
  return {
    error: result.error,
    output: result.output,
    requests: result.requests.map(call => {
      const requestBody = call.requestBody as
        | {
            response_format?: unknown;
            responseFormat?: unknown;
            generationConfig?: { responseMimeType?: unknown };
            tools?: unknown;
            tool_choice?: unknown;
            toolChoice?: unknown;
            toolConfig?: unknown;
          }
        | undefined;
      const responseBody = call.responseBody as
        | {
            content?: Array<{ type?: unknown }>;
            error?: unknown;
            finishReason?: unknown;
            providerMetadata?: {
              gateway?: {
                routing?: { finalProvider?: unknown };
              };
            };
          }
        | undefined;

      return {
        hasResponseFormat:
          requestBody?.response_format != null ||
          requestBody?.responseFormat != null ||
          requestBody?.generationConfig?.responseMimeType != null,
        hasTools: requestBody?.tools != null,
        responseBody:
          responseBody?.error != null
            ? { error: responseBody.error }
            : responseBody?.finishReason != null
              ? {
                  contentTypes: Array.isArray(responseBody.content)
                    ? responseBody.content.map(part => part.type)
                    : undefined,
                  finalProvider:
                    responseBody.providerMetadata?.gateway?.routing
                      ?.finalProvider,
                  finishReason: responseBody.finishReason,
                }
              : undefined,
        status: call.status,
        toolChoice:
          requestBody?.tool_choice ??
          requestBody?.toolChoice ??
          requestBody?.toolConfig,
      };
    }),
    stepCount: result.stepCount,
    toolExecutionCount: result.toolExecutionCount,
  };
}

async function main() {
  const groqGenerateCalls: CapturedCall[] = [];
  const groqAgentCalls: CapturedCall[] = [];
  const googleGenerateCalls: CapturedCall[] = [];
  const googleAgentCalls: CapturedCall[] = [];
  const gatewayGenerateCalls: CapturedCall[] = [];
  const gatewayAgentCalls: CapturedCall[] = [];
  const gatewayStepScopedAgentCalls: CapturedCall[] = [];

  const results = {
    groq: {
      generateText: await runGenerateText(
        createGroq({
          fetch: createCapturingFetch(groqGenerateCalls),
        })('openai/gpt-oss-120b'),
        groqGenerateCalls,
      ),
      agent: await runAgent(
        createGroq({
          fetch: createCapturingFetch(groqAgentCalls),
        })('openai/gpt-oss-120b'),
        groqAgentCalls,
      ),
    },
    google: {
      generateText: await runGenerateText(
        createGoogleGenerativeAI({
          fetch: createCapturingFetch(googleGenerateCalls),
        })('gemini-2.5-flash-lite'),
        googleGenerateCalls,
      ),
      agent: await runAgent(
        createGoogleGenerativeAI({
          fetch: createCapturingFetch(googleAgentCalls),
        })('gemini-2.5-flash-lite'),
        googleAgentCalls,
      ),
    },
    gateway: {
      generateText: await runGenerateText(
        createGateway({
          fetch: createCapturingFetch(gatewayGenerateCalls),
        })('openai/gpt-oss-120b'),
        gatewayGenerateCalls,
      ),
      agent: await runAgent(
        createGateway({
          fetch: createCapturingFetch(gatewayAgentCalls),
        })('openai/gpt-oss-120b'),
        gatewayAgentCalls,
      ),
      agentWithStepScopedToolChoice: await runAgent(
        createGateway({
          fetch: createCapturingFetch(gatewayStepScopedAgentCalls),
        })('openai/gpt-oss-120b'),
        gatewayStepScopedAgentCalls,
        { stepScopedToolChoice: true },
      ),
    },
  };

  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(results).map(([provider, scenarios]) => [
          provider,
          Object.fromEntries(
            Object.entries(scenarios).map(([scenario, result]) => [
              scenario,
              summarize(result),
            ]),
          ),
        ]),
      ),
      null,
      2,
    ),
  );

  const failures = [
    ['groq.generateText', results.groq.generateText],
    ['groq.agent', results.groq.agent],
    ['google.generateText', results.google.generateText],
    ['google.agent', results.google.agent],
  ]
    .filter(([, result]) => !worked(result as ScenarioResult))
    .map(([name]) => name);

  if (failures.length > 0) {
    throw new Error(
      `Reproduced issue #10023: output with tools did not complete successfully (${failures.join(', ')}).`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
