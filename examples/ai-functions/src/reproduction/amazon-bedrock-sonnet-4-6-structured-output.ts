import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const schema = z
  .object({
    metadata: z
      .object({
        kind: z.literal('draft').describe('The document discriminator.'),
        title: z.string().describe('A concise title for the proposal.'),
        audience: z
          .string()
          .optional()
          .describe('The intended internal audience.'),
        objective: z
          .string()
          .optional()
          .describe('The concrete objective of the proposal.'),
        tone: z
          .string()
          .optional()
          .describe('The writing tone used in the proposal.'),
      })
      .describe('Document metadata.'),
    sections: z
      .array(
        z
          .object({
            heading: z.string().describe('The section heading.'),
            body: z
              .string()
              .describe('Two or three concise sentences of section prose.'),
            summary: z
              .string()
              .optional()
              .describe('A one-sentence section summary.'),
            keyPoints: z
              .array(z.string())
              .optional()
              .describe('Important points from the section.'),
            evidence: z
              .array(
                z.object({
                  claim: z
                    .string()
                    .describe('A claim supporting the proposal.'),
                  source: z
                    .string()
                    .optional()
                    .describe('The source or basis for the claim.'),
                  caveat: z
                    .string()
                    .optional()
                    .describe('A limitation of the evidence.'),
                }),
              )
              .optional()
              .describe('Evidence supporting the section.'),
            recommendations: z
              .array(
                z.object({
                  action: z.string().describe('A recommended action.'),
                  rationale: z
                    .string()
                    .optional()
                    .describe('Why this action is recommended.'),
                  owner: z
                    .string()
                    .optional()
                    .describe('The team responsible for the action.'),
                  priority: z
                    .enum(['low', 'medium', 'high'])
                    .optional()
                    .describe('The priority of the action.'),
                }),
              )
              .optional()
              .describe('Actions recommended by the section.'),
            risks: z
              .array(
                z.object({
                  risk: z.string().describe('A delivery or adoption risk.'),
                  mitigation: z
                    .string()
                    .optional()
                    .describe('A practical mitigation for the risk.'),
                  severity: z
                    .enum(['low', 'medium', 'high'])
                    .optional()
                    .describe('The severity of the risk.'),
                }),
              )
              .optional()
              .describe('Risks relevant to the section.'),
            transition: z
              .string()
              .optional()
              .describe('A short transition to the next section.'),
          })
          .describe('A proposal section.'),
      )
      .describe('The proposal sections.'),
    review: z
      .object({
        openQuestions: z
          .array(z.string())
          .optional()
          .describe('Questions that remain unresolved.'),
        nextSteps: z
          .array(z.string())
          .optional()
          .describe('Immediate next steps after review.'),
      })
      .describe('Review notes for the proposal.'),
  })
  .describe('A concise internal proposal.');

type CapturedExchange = {
  requestBody?: unknown;
  responseBody?: unknown;
};

async function main() {
  const attempts = Number(process.env.REPRO_ATTEMPTS ?? 6);
  const maxOutputTokens = Number(process.env.REPRO_MAX_OUTPUT_TOKENS ?? 4096);
  const exchanges: CapturedExchange[] = [];
  const bedrock = createAmazonBedrock({
    region: 'eu-west-1',
    fetch: async (input, init) => {
      const exchange: CapturedExchange = {};

      if (typeof init?.body === 'string') {
        exchange.requestBody = JSON.parse(init.body);
      }

      const response = await fetch(input, init);
      exchange.responseBody = await response.clone().json();
      exchanges.push(exchange);
      return response;
    },
  });

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await generateText({
      model: bedrock('eu.anthropic.claude-sonnet-4-6'),
      maxOutputTokens,
      output: Output.object({ schema }),
      prompt: [
        'Write a concise internal proposal for a four-week pilot that uses AI',
        'to triage incoming customer-support requests.',
        'Use exactly four sections: Context, Pilot Design, Measurement, and Risks.',
        'Keep each section body to two or three sentences.',
        'Include only relevant optional fields and keep every list short.',
      ].join(' '),
    });

    const zeroWidthSpaces = (result.text.match(/\u200b/g) ?? []).length;
    const longestRun = Math.max(
      0,
      ...Array.from(result.text.matchAll(/\u200b+/g), match => match[0].length),
    );

    console.log(
      JSON.stringify({
        attempt,
        finishReason: result.finishReason,
        outputTokens: result.usage.outputTokens,
        zeroWidthSpaces,
        longestRun,
        textLength: result.text.length,
        requestUsesNativeOutput:
          (
            exchanges.at(-1)?.requestBody as {
              additionalModelRequestFields?: {
                output_config?: { format?: { type?: string } };
              };
            }
          )?.additionalModelRequestFields?.output_config?.format?.type ===
          'json_schema',
        rawStopReason: (
          exchanges.at(-1)?.responseBody as { stopReason?: string }
        )?.stopReason,
        ...(result.finishReason === 'length' && {
          textTail: result.text.slice(-500),
        }),
      }),
    );

    if (
      result.finishReason === 'length' &&
      longestRun >= 32 &&
      result.usage.outputTokens === maxOutputTokens
    ) {
      // Accessing output demonstrates the reported user-visible failure:
      // generateText does not parse structured output after a length finish.
      result.output;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
