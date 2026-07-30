import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, tool } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';

async function main() {
  let requestBody: unknown;
  const liveResponseFixture = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../../packages/amazon-bedrock/src/__fixtures__/bedrock-opus-4-7-strict-tool-live.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );

  const bedrock = createAmazonBedrock({
    apiKey: 'fixture-api-key',
    region: 'us-east-1',
    fetch: async (input, init) => {
      requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      return new Response(JSON.stringify(liveResponseFixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await generateText({
    model: bedrock('us.anthropic.claude-opus-4-7'),
    maxOutputTokens: 128,
    maxRetries: 0,
    prompt: 'Call the report_result tool with value "ok".',
    tools: {
      report_result: tool({
        description: 'Report the requested value.',
        inputSchema: z.object({ value: z.string() }),
        strict: true,
      }),
    },
    toolChoice: 'required',
  });

  const toolSpec = (
    requestBody as {
      toolConfig?: { tools?: Array<{ toolSpec?: { strict?: boolean } }> };
    }
  ).toolConfig?.tools?.[0]?.toolSpec;

  if (toolSpec?.strict != null) {
    throw new Error(
      'ISSUE_18199_SETUP_FAILED: strict was unexpectedly sent to Bedrock',
    );
  }

  const strictWarning = result.warnings?.find(
    warning => warning.type === 'unsupported' && warning.feature === 'strict',
  );

  if (strictWarning == null) {
    throw new Error(
      'ISSUE_18199_REPRODUCED: strict=true was omitted without an unsupported warning',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
