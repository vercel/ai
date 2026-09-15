import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { generateObject } from 'ai';
import { z } from 'zod';

const profileArn =
  'arn:aws:bedrock:us-east-1:474668406012:application-inference-profile/kr2b9n8klm2f';

async function main() {
  const requestBodies: any[] = [];

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    fetch: async (input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return fetch(input, init);
    },
  });

  const model = (
    bedrock as unknown as (
      modelId: string,
      settings: { modelFamily: 'anthropic' },
    ) => LanguageModelV4
  )(profileArn, { modelFamily: 'anthropic' });

  for (const structuredOutputMode of ['outputFormat', 'auto'] as const) {
    await generateObject({
      model,
      schema: z.object({
        assignments: z.array(
          z.object({
            id: z.string(),
            category: z.enum(['a', 'b']),
          }),
        ),
        entities: z.array(z.object({ name: z.string() })),
        relations: z.array(
          z.object({
            from: z.string(),
            to: z.string(),
          }),
        ),
      }),
      prompt:
        'Two items: "see you Tuesday", "can everyone hear me". Categorize each and return empty lists where nothing applies.',
      providerOptions: {
        amazonBedrock: {
          structuredOutputMode,
        },
      },
    });
  }

  const requestShapes = requestBodies.map(requestBody => ({
    nativeFormat:
      requestBody?.additionalModelRequestFields?.output_config?.format,
    toolNames: (requestBody?.toolConfig?.tools ?? []).map(
      (tool: any) => tool.toolSpec?.name,
    ),
  }));

  if (
    requestShapes.some(
      ({ nativeFormat, toolNames }) =>
        nativeFormat == null && toolNames.includes('json'),
    )
  ) {
    console.error(
      'ISSUE_20780_REPRODUCED: application inference profile used synthetic json tool instead of native structured output',
    );
    process.exitCode = 1;
    return;
  }

  if (
    requestShapes.length !== 2 ||
    requestShapes.some(
      ({ nativeFormat, toolNames }) =>
        nativeFormat == null || toolNames.length !== 0,
    )
  ) {
    throw new Error(
      `Unexpected Converse request shapes: ${JSON.stringify(requestShapes)}`,
    );
  }

  console.log(
    'Application inference profile used native structured output as expected.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
