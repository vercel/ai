import { createOpenAI } from '@ai-sdk/openai';
import { OpenTelemetry } from '@ai-sdk/otel';
import {
  NodeTracerProvider,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-node';
import { generateText, registerTelemetry, stepCountIs } from 'ai';
import { writeFile } from 'node:fs/promises';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonAttribute(
  attributes: ReadableSpan['attributes'],
  name: string,
): unknown {
  const value = attributes[name];
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function getParts(messages: unknown): JsonObject[] {
  if (!Array.isArray(messages)) return [];

  return messages.flatMap(message => {
    if (!isObject(message) || !Array.isArray(message.parts)) return [];
    return message.parts.filter(isObject);
  });
}

async function main() {
  const spans: ReadableSpan[] = [];
  const rawResponses: JsonObject[] = [];

  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [
      {
        onStart() {},
        onEnd(span) {
          spans.push(span);
        },
        forceFlush: async () => {},
        shutdown: async () => {},
      },
    ],
  });
  tracerProvider.register();

  registerTelemetry(
    new OpenTelemetry({ tracer: tracerProvider.getTracer('issue-19007') }),
  );

  const openai = createOpenAI({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      const body = await response.clone().json();
      if (isObject(body)) rawResponses.push(body);
      return response;
    },
  });

  const result = await generateText({
    model: openai('gpt-5.5'),
    prompt:
      'Use the DeepWiki MCP tools to investigate vercel/ai. First call read_wiki_structure for vercel/ai, then call ask_question to explain what the repository is for. Do not answer without using both tools.',
    tools: {
      mcp: openai.tools.mcp({
        serverLabel: 'deepwiki',
        serverUrl: 'https://mcp.deepwiki.com/mcp',
      }),
    },
    stopWhen: stepCountIs(5),
    telemetry: {
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
    },
  });

  await tracerProvider.forceFlush();
  await tracerProvider.shutdown();

  if (process.env.ISSUE_19007_RECORD_FIXTURE === '1' && rawResponses[0]) {
    await writeFile(
      new URL(
        '../../../../packages/openai/src/responses/__fixtures__/openai-issue-19007-hosted-mcp.json',
        import.meta.url,
      ),
      `${JSON.stringify(rawResponses[0], null, 2)}\n`,
    );
  }

  const toolCalls = result.steps.flatMap(step =>
    step.content.filter(part => part.type === 'tool-call'),
  );
  const toolResults = result.steps.flatMap(step =>
    step.content.filter(part => part.type === 'tool-result'),
  );
  const providerExecutedCalls = toolCalls.filter(
    part => part.providerExecuted === true,
  );
  const providerExecutedResults = toolResults.filter(
    part => part.providerExecuted === true,
  );

  const rawOutput = rawResponses.flatMap(response =>
    Array.isArray(response.output) ? response.output.filter(isObject) : [],
  );
  const rawToolList = rawOutput.find(item => item.type === 'mcp_list_tools');
  const rawMcpCalls = rawOutput.filter(item => item.type === 'mcp_call');

  if (
    providerExecutedCalls.length < 2 ||
    providerExecutedResults.length < 2 ||
    !rawToolList ||
    rawMcpCalls.length < 2
  ) {
    throw new Error(
      `LIVE_PROVIDER_PRECONDITION_FAILED: appCalls=${providerExecutedCalls.length} appResults=${providerExecutedResults.length} rawMcpCalls=${rawMcpCalls.length} rawToolList=${rawToolList != null}`,
    );
  }

  const calledToolNames = new Set(
    providerExecutedCalls.map(part => part.toolName),
  );
  const executeToolSpans = spans.filter(
    span => span.attributes['gen_ai.operation.name'] === 'execute_tool',
  );
  const spannedToolNames = new Set(
    executeToolSpans.map(span => span.attributes['gen_ai.tool.name']),
  );
  const callsMissingSpans = [...calledToolNames].filter(
    name => !spannedToolNames.has(name),
  );

  const outputParts = spans.flatMap(span =>
    getParts(parseJsonAttribute(span.attributes, 'gen_ai.output.messages')),
  );
  const responseIds = new Set(
    outputParts
      .filter(part => part.type === 'tool_call_response')
      .map(part => part.id),
  );
  const resultSpanIds = new Set(
    executeToolSpans
      .filter(span => span.attributes['gen_ai.tool.call.result'] !== undefined)
      .map(span => span.attributes['gen_ai.tool.call.id']),
  );
  const resultsMissingFromTelemetry = providerExecutedResults.filter(
    part =>
      !responseIds.has(part.toolCallId) && !resultSpanIds.has(part.toolCallId),
  );

  const declaredToolNames = new Set(
    spans.flatMap(span => {
      const definitions = parseJsonAttribute(
        span.attributes,
        'gen_ai.tool.definitions',
      );
      if (!Array.isArray(definitions)) return [];
      return definitions.flatMap(definition =>
        isObject(definition) && typeof definition.name === 'string'
          ? [definition.name]
          : [],
      );
    }),
  );
  const calledToolsMissingFromDefinitions = [...calledToolNames].filter(
    name => !declaredToolNames.has(name),
  );

  console.log(
    JSON.stringify(
      {
        app: {
          calls: providerExecutedCalls.map(part => ({
            id: part.toolCallId,
            name: part.toolName,
          })),
          results: providerExecutedResults.map(part => ({
            id: part.toolCallId,
            name: part.toolName,
          })),
        },
        provider: {
          importedTools:
            isObject(rawToolList) && Array.isArray(rawToolList.tools)
              ? rawToolList.tools
                  .filter(isObject)
                  .map(tool => tool.name)
                  .filter(name => typeof name === 'string')
              : [],
          calls: rawMcpCalls.map(call => call.name),
        },
        telemetry: {
          spanNames: spans.map(span => span.name),
          executeToolNames: [...spannedToolNames],
          responseIds: [...responseIds],
          declaredToolNames: [...declaredToolNames],
        },
      },
      null,
      2,
    ),
  );

  const failures = [
    callsMissingSpans.length > 0
      ? `missing execute_tool spans for ${callsMissingSpans.join(', ')}`
      : undefined,
    resultsMissingFromTelemetry.length > 0
      ? `missing results for ${resultsMissingFromTelemetry.map(part => part.toolName).join(', ')}`
      : undefined,
    calledToolsMissingFromDefinitions.length > 0
      ? `missing definitions for ${calledToolsMissingFromDefinitions.join(', ')}`
      : undefined,
  ].filter((failure): failure is string => failure != null);

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_19007_REPRODUCED: hosted MCP telemetry is incomplete: ${failures.join('; ')}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
