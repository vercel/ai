import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import sharp from 'sharp';
import { z } from 'zod';

const visionSchema = z
  .object({
    summary: z.string(),
    dominantColor: z.enum(['red', 'green', 'blue', 'mixed', 'unknown']),
    imageType: z.enum(['photo', 'graphic', 'document', 'unknown']),
    confidence: z.number().min(0).max(1),
    observations: z.array(
      z
        .object({
          label: z.string(),
          evidence: z.string(),
          confidence: z.number().min(0).max(1),
        })
        .strict(),
    ),
    personalization: z
      .object({
        audience: z.string(),
        tone: z.enum(['concise', 'friendly', 'technical']),
        relevantPreferences: z.array(z.string()),
      })
      .strict(),
    safety: z
      .object({
        sensitiveContent: z.boolean(),
        notes: z.array(z.string()),
      })
      .strict(),
    tags: z.array(z.string()),
  })
  .strict();

const extractionSchema = z
  .object({
    documentType: z.enum(['invoice', 'receipt', 'memo', 'report', 'unknown']),
    jurisdiction: z.enum(['federal', 'state', 'local', 'international']),
    filingStatus: z.enum(['draft', 'submitted', 'accepted', 'rejected']),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    department: z.enum(['finance', 'legal', 'operations', 'engineering']),
    priority: z.enum(['p0', 'p1', 'p2', 'p3']),
    confidentiality: z.enum([
      'public',
      'internal',
      'confidential',
      'restricted',
    ]),
    reviewType: z.enum(['automatic', 'manual', 'legal', 'executive']),
    categories: z.array(
      z.enum(['tax', 'payroll', 'compliance', 'audit', 'billing', 'security']),
    ),
    applicableRules: z.array(z.string()),
    extractedEntities: z.array(
      z
        .object({
          name: z.string(),
          kind: z.enum(['person', 'organization', 'date', 'amount', 'rule']),
          value: z.string(),
          confidence: z.number().min(0).max(1),
        })
        .strict(),
    ),
    rationale: z.string(),
  })
  .strict();

type Scenario = {
  name: string;
  attempts: number;
  run: (attempt: number) => Promise<{
    object: unknown;
    rawText: string;
    requestBody: unknown;
  }>;
};

function assertNoParameterWrapper({
  scenario,
  attempt,
  object,
  rawText,
}: {
  scenario: string;
  attempt: number;
  object: unknown;
  rawText: string;
}) {
  const serializedObject = JSON.stringify(object);
  const wrapperPattern = /\$(?:PARAMETER_NAME|PARAMETER|JSON)/;

  if (wrapperPattern.test(rawText) || wrapperPattern.test(serializedObject)) {
    throw new Error(
      `ISSUE_10845_REPRODUCED: ${scenario} attempt ${attempt} returned a $PARAMETER_NAME-style wrapper. Raw output: ${rawText}`,
    );
  }
}

async function createJpegDataUrl() {
  const image = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 220, g: 30, b: 30 },
    },
  })
    .jpeg()
    .toBuffer();

  return `data:image/jpeg;base64,${image.toString('base64')}`;
}

async function main() {
  const image = await createJpegDataUrl();
  const personalizedContext = [
    'The user is a museum catalog editor who prefers concise, friendly language.',
    'They are color-blind and need explicit color names rather than color-only cues.',
    'They want factual observations separated from uncertain inferences.',
    'They use the result in an accessibility review workflow.',
  ].join(' ');
  const personalizedPrompt = [
    'Analyze the supplied image for this personalized accessibility workflow.',
    'Respond with JSON only. Use JSON matching the supplied schema exactly.',
    ...Array.from(
      { length: 24 },
      (_, index) =>
        `Personalization note ${index + 1}: ${personalizedContext} Preserve the distinction between observation, inference, and user preference.`,
    ),
    'Do not add markdown or commentary outside the JSON response.',
  ].join('\n');

  if (personalizedPrompt.length < 5183) {
    throw new Error(
      'Harness error: personalized prompt is shorter than 5183 characters.',
    );
  }

  const taxonomy = Array.from(
    { length: 140 },
    (_, index) =>
      `Rule TAX-${String(index + 1).padStart(3, '0')}: classify finance records by jurisdiction, filing state, risk, department, priority, confidentiality, review type, category, named entities, and applicable compliance rules. Respond with JSON only when extracting structured records.`,
  ).join('\n');
  const cachedSystemPrompt = [
    'You are a document classification engine.',
    'Use the detailed taxonomy below and respond with JSON matching the requested schema.',
    taxonomy,
  ].join('\n');

  const scenarios: Scenario[] = [
    {
      name: 'vision plus 5K personalized prompt',
      attempts: 3,
      run: async () => {
        let rawText = '';
        const result = await generateObject({
          model: anthropic('claude-sonnet-4-5'),
          schema: visionSchema,
          schemaName: 'personalized_photo_analysis',
          schemaDescription:
            'A personalized, accessibility-focused analysis of the supplied image.',
          messages: [
            {
              role: 'system',
              content:
                'Follow the requested structured output schema exactly. Respond with JSON only.',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: personalizedPrompt },
                { type: 'image', image },
              ],
            },
          ],
          allowSystemInMessages: true,
          temperature: 0,
          maxOutputTokens: 1600,
          onStepEnd: event => {
            rawText = event.objectText;
          },
        });

        return {
          object: result.object,
          rawText,
          requestBody: result.request.body,
        };
      },
    },
    {
      name: 'cached multi-message complex prompt without vision',
      attempts: 5,
      run: async attempt => {
        let rawText = '';
        const result = await generateObject({
          model: anthropic('claude-sonnet-4-5'),
          schema: extractionSchema,
          schemaName: 'classified_record',
          schemaDescription:
            'A strict classification and extraction result for one business record.',
          messages: [
            {
              role: 'system',
              content: cachedSystemPrompt,
              providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
              },
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: [
                    'Cached customer context:',
                    'Acme Payroll LLC operates in California and is preparing a confidential draft state payroll tax report.',
                    'The report requires manual finance review and has medium risk.',
                  ].join('\n'),
                  providerOptions: {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                  },
                },
              ],
            },
            {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'I will apply the supplied taxonomy to the next record.',
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: [
                    `Extraction attempt ${attempt}:`,
                    'Classify the California payroll tax report described above.',
                    'Respond with JSON only and match every field in the schema.',
                  ].join('\n'),
                },
              ],
            },
          ],
          allowSystemInMessages: true,
          temperature: 0,
          maxOutputTokens: 1800,
          onStepEnd: event => {
            rawText = event.objectText;
          },
        });

        return {
          object: result.object,
          rawText,
          requestBody: result.request.body,
        };
      },
    },
  ];

  for (const scenario of scenarios) {
    for (let attempt = 1; attempt <= scenario.attempts; attempt++) {
      let rawText = '';

      try {
        const result = await scenario.run(attempt);
        rawText = result.rawText;
        assertNoParameterWrapper({
          scenario: scenario.name,
          attempt,
          object: result.object,
          rawText,
        });

        const requestBody = result.requestBody as {
          output_config?: { format?: { type?: string } };
          tools?: unknown;
        };

        if (requestBody.output_config?.format?.type !== 'json_schema') {
          throw new Error(
            `Harness error: ${scenario.name} attempt ${attempt} did not use Anthropic native json_schema output.`,
          );
        }

        console.log(
          `PASS ${scenario.name} attempt ${attempt}: schema-valid direct object; native json_schema request`,
        );
      } catch (error) {
        assertNoParameterWrapper({
          scenario: scenario.name,
          attempt,
          object: {},
          rawText,
        });
        throw error;
      }
    }
  }

  console.log(
    'ISSUE_10845_NOT_REPRODUCED: all 8 Claude Sonnet 4.5 calls returned schema-valid direct objects without a $PARAMETER_NAME-style wrapper.',
  );

  if (process.env.ISSUE_10845_COMPARE_JSON_TOOL === '1') {
    let rawText = '';

    try {
      const result = await generateObject({
        model: anthropic('claude-sonnet-4-5'),
        schema: visionSchema,
        messages: [
          {
            role: 'system',
            content:
              'Follow the requested structured output schema exactly. Respond with JSON only.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: personalizedPrompt },
              { type: 'image', image },
            ],
          },
        ],
        allowSystemInMessages: true,
        temperature: 0,
        maxOutputTokens: 1600,
        providerOptions: {
          anthropic: { structuredOutputMode: 'jsonTool' },
        },
        onStepEnd: event => {
          rawText = event.objectText;
        },
      });

      assertNoParameterWrapper({
        scenario: 'forced legacy jsonTool comparison',
        attempt: 1,
        object: result.object,
        rawText,
      });
      console.log(
        'LEGACY_JSON_TOOL_COMPARISON: schema-valid direct object without a wrapper.',
      );
    } catch (error) {
      if (/\$(?:PARAMETER_NAME|PARAMETER|JSON)/.test(rawText)) {
        console.log(
          `LEGACY_JSON_TOOL_COMPARISON: wrapper observed in raw output: ${rawText}`,
        );
      } else {
        throw error;
      }
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
