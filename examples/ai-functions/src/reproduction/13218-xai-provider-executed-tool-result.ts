import 'dotenv/config';
import fs from 'node:fs';
import { xai } from '@ai-sdk/xai';
import { APICallError, streamText } from 'ai';

function stringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function main() {
  const result = streamText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    tools: {
      web_search: xai.tools.webSearch(),
    },
    toolChoice: 'required',
    include: { rawChunks: true },
    prompt:
      'Use the web_search tool to find the current title of https://x.ai, then answer in one short sentence.',
  });

  const rawChunks: string[] = [];
  const providerToolCalls: Array<{ toolCallId: string; toolName: string }> = [];
  const providerToolResults: Array<{ toolCallId: string; toolName: string }> =
    [];

  for await (const part of result.fullStream) {
    if (part.type === 'raw') {
      rawChunks.push(stringify(part.rawValue));
    }

    if (part.type === 'tool-call' && part.providerExecuted) {
      providerToolCalls.push({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
      });
      console.log(`provider tool-call: ${part.toolName} ${part.toolCallId}`);
    }

    if (part.type === 'tool-result' && part.providerExecuted) {
      providerToolResults.push({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
      });
      console.log(`provider tool-result: ${part.toolName} ${part.toolCallId}`);
    }
  }

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(
    'output/13218-xai-provider-executed-tool-result.1.chunks.txt',
    rawChunks.join('\n'),
  );

  if (providerToolCalls.length === 0) {
    console.error(
      'BLOCKED: the live xAI response did not execute a provider tool, so issue #13218 could not be assessed.',
    );
    process.exit(2);
  }

  const missingResults = providerToolCalls.filter(
    call =>
      !providerToolResults.some(
        result => result.toolCallId === call.toolCallId,
      ),
  );

  if (missingResults.length > 0) {
    console.error(
      `REPRODUCED: provider-executed tool-call(s) had no matching tool-result: ${JSON.stringify(
        missingResults,
      )}`,
    );
    process.exit(1);
  }

  console.log(
    'Could not reproduce: every provider-executed tool-call had a matching tool-result.',
  );
}

main().catch(error => {
  if (APICallError.isInstance(error)) {
    console.error(
      `BLOCKED: xAI API call failed with status ${error.statusCode ?? 'unknown'}: ${error.message}`,
    );
    if (error.responseBody != null) {
      console.error(error.responseBody);
    }
    process.exit(2);
  }

  if (error instanceof Error && error.name.includes('LoadAPIKeyError')) {
    console.error(`BLOCKED: ${error.message}`);
    process.exit(2);
  }

  console.error(error);
  process.exit(1);
});
