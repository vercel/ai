import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateway, generateText, stepCountIs, tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import {
  experimental_createCodeModeTool as createCodeModeTool,
  experimental_setMaxWorkers as setMaxWorkers,
} from '../../dist/index.js';

const HAIKU_MODEL_ID = 'anthropic/claude-haiku-4.5';
const CODE_SAMPLES_DIR = join(process.cwd(), 'code-samples');
const hasGatewayCredentials = process.env.AI_GATEWAY_API_KEY !== undefined;
const describeIfGateway = hasGatewayCredentials ? describe : describe.skip;

setMaxWorkers(2);

describeIfGateway('code mode e2e with Claude Haiku 4.5', () => {
  it('uses code mode to project only needed fields from larger tool responses', async () => {
    const codeMode = createCodeModeTool(
      {
        getFoo: tool({
          description:
            'Return the foo value plus extra fields that should not be returned.',
          inputSchema: z.object({
            key: z.string(),
          }),
          outputSchema: z.object({
            foo: z.string(),
            ignored: z.string(),
            metadata: z.object({
              source: z.string(),
            }),
          }),
          execute: async ({ key }) => ({
            foo: `foo:${key}`,
            ignored: 'do-not-return',
            metadata: { source: 'fixture' },
          }),
        }),
        getBar: tool({
          description:
            'Return a bar record plus private fields that should not be returned.',
          inputSchema: z.object({
            key: z.string(),
          }),
          outputSchema: z.object({
            id: z.string(),
            label: z.string(),
            privateNote: z.string(),
          }),
          execute: async ({ key }) => ({
            id: `bar:${key}`,
            label: 'Bar label',
            privateNote: 'do-not-return',
          }),
        }),
      },
      {
        executionPolicy: {
          timeoutMs: 20_000,
        },
      },
    );

    const result = await generateText({
      model: gateway(HAIKU_MODEL_ID),
      tools: { codeMode },
      toolChoice: { type: 'tool', toolName: 'codeMode' },
      stopWhen: stepCountIs(1),
      temperature: 0,
      maxRetries: 0,
      timeout: { totalMs: 60_000, stepMs: 45_000 },
      prompt: [
        'Call the codeMode tool exactly once.',
        "Inside code mode, call getFoo with { key: 'alpha' } and getBar with { key: 'bravo' }.",
        'Return exactly this object from the code-mode program and no larger tool responses:',
        '{ foo: fooResponse.foo, barId: { id: barResponse.id } }',
      ].join('\n'),
    });

    writeCodeSample('project-needed-fields', result);

    expect(codeModeOutput(result)).toEqual({
      foo: 'foo:alpha',
      barId: { id: 'bar:bravo' },
    });
  });

  it('uses code mode with a nested host tool whose name is not a JavaScript identifier', async () => {
    const codeMode = createCodeModeTool({
      'lookup-user': tool({
        description: 'Look up a user profile.',
        inputSchema: z.object({
          userId: z.string(),
        }),
        outputSchema: z.object({
          id: z.string(),
          plan: z.enum(['free', 'pro', 'enterprise']),
          email: z.string(),
          privateNote: z.string(),
        }),
        execute: async ({ userId }) => ({
          id: userId,
          plan: 'pro' as const,
          email: `${userId}@example.test`,
          privateNote: 'do-not-return',
        }),
      }),
    });

    const result = await generateText({
      model: gateway(HAIKU_MODEL_ID),
      tools: { codeMode },
      toolChoice: { type: 'tool', toolName: 'codeMode' },
      stopWhen: stepCountIs(1),
      temperature: 0,
      maxRetries: 0,
      timeout: { totalMs: 60_000, stepMs: 45_000 },
      prompt: [
        'Call the codeMode tool exactly once.',
        "Inside code mode, call the host tool named lookup-user with { userId: 'u_123' }.",
        'Return exactly { userId: user.id, plan: user.plan } from the code-mode program.',
      ].join('\n'),
    });

    writeCodeSample('non-identifier-tool-name', result);

    expect(codeModeOutput(result)).toEqual({
      userId: 'u_123',
      plan: 'pro',
    });
  });

  it('uses code mode over two turns to assemble a compact quote from several tools', async () => {
    const codeMode = createCodeModeTool(
      {
        searchCatalog: tool({
          description: 'Find products in the catalog.',
          inputSchema: z.object({
            query: z.string(),
            maxResults: z.number().int().min(1).max(5),
          }),
          outputSchema: z.object({
            products: z.array(
              z.object({
                sku: z.string(),
                name: z.string(),
                category: z.string(),
                tags: z.array(z.string()),
                internalMarginBps: z.number(),
              }),
            ),
          }),
          execute: async ({ maxResults }) => ({
            products: [
              {
                sku: 'chair-basic',
                name: 'Task Chair',
                category: 'office-seating',
                tags: ['ergonomic', 'mesh'],
                internalMarginBps: 1800,
              },
              {
                sku: 'chair-pro',
                name: 'Ergo Chair Pro',
                category: 'office-seating',
                tags: ['ergonomic', 'adjustable', 'lumbar'],
                internalMarginBps: 2200,
              },
              {
                sku: 'chair-max',
                name: 'Ergo Chair Max',
                category: 'office-seating',
                tags: ['ergonomic', 'executive'],
                internalMarginBps: 2600,
              },
            ].slice(0, maxResults),
          }),
        }),
        getInventory: tool({
          description: 'Return inventory for a SKU.',
          inputSchema: z.object({
            sku: z.string(),
          }),
          outputSchema: z.object({
            sku: z.string(),
            available: z.number(),
            warehouses: z.array(
              z.object({
                id: z.string(),
                available: z.number(),
              }),
            ),
          }),
          execute: async ({ sku }) => {
            const inventory: Record<
              string,
              {
                available: number;
                warehouses: Array<{ id: string; available: number }>;
              }
            > = {
              'chair-basic': {
                available: 0,
                warehouses: [{ id: 'west-1', available: 0 }],
              },
              'chair-pro': {
                available: 8,
                warehouses: [
                  { id: 'west-1', available: 5 },
                  { id: 'central-1', available: 3 },
                ],
              },
              'chair-max': {
                available: 3,
                warehouses: [{ id: 'east-1', available: 3 }],
              },
            };

            return { sku, ...inventory[sku] };
          },
        }),
        getPricing: tool({
          description: 'Return customer-specific pricing for a SKU.',
          inputSchema: z.object({
            customerId: z.string(),
            sku: z.string(),
          }),
          outputSchema: z.object({
            sku: z.string(),
            listPriceCents: z.number(),
            discountPct: z.number(),
            unitPriceCents: z.number(),
            internalCostCents: z.number(),
          }),
          execute: async ({ sku }) => {
            const pricing: Record<
              string,
              {
                listPriceCents: number;
                discountPct: number;
                unitPriceCents: number;
                internalCostCents: number;
              }
            > = {
              'chair-basic': {
                listPriceCents: 21900,
                discountPct: 9,
                unitPriceCents: 19900,
                internalCostCents: 12800,
              },
              'chair-pro': {
                listPriceCents: 27900,
                discountPct: 14,
                unitPriceCents: 23900,
                internalCostCents: 15400,
              },
              'chair-max': {
                listPriceCents: 37900,
                discountPct: 13,
                unitPriceCents: 32900,
                internalCostCents: 21300,
              },
            };

            return { sku, ...pricing[sku] };
          },
        }),
        getCustomer: tool({
          description: 'Return customer buying preferences.',
          inputSchema: z.object({
            customerId: z.string(),
          }),
          outputSchema: z.object({
            id: z.string(),
            tier: z.enum(['free', 'pro', 'enterprise']),
            region: z.string(),
            defaultQuantity: z.number(),
            email: z.string(),
            privateNote: z.string(),
          }),
          execute: async ({ customerId }) => ({
            id: customerId,
            tier: 'enterprise' as const,
            region: 'us-west',
            defaultQuantity: 4,
            email: 'buyer@example.test',
            privateNote: 'do-not-return',
          }),
        }),
        estimateShipping: tool({
          description: 'Estimate shipping for a SKU and region.',
          inputSchema: z.object({
            sku: z.string(),
            region: z
              .string()
              .describe('Use the exact region returned by getCustomer.'),
            quantity: z.number(),
          }),
          outputSchema: z.object({
            carrier: z.string(),
            etaDays: z.number(),
            costCents: z.number(),
            warehouseId: z.string(),
            internalRoute: z.string(),
          }),
          execute: async ({ region }) => {
            const normalizedRegion = region.toLowerCase();
            return {
              carrier: 'Vercel Freight',
              etaDays: normalizedRegion === 'us-west' ? 3 : 5,
              costCents: normalizedRegion === 'us-west' ? 4200 : 6900,
              warehouseId: 'west-1',
              internalRoute: 'route-secret',
            };
          },
        }),
        createQuote: tool({
          description: 'Create a quote for selected items.',
          inputSchema: z.object({
            customerId: z.string(),
            sku: z.string(),
            quantity: z.number(),
            unitPriceCents: z.number(),
            shippingCents: z.number(),
          }),
          outputSchema: z.object({
            quoteId: z.string(),
            totalCents: z.number(),
            expiresOn: z.string(),
            internalApprovalCode: z.string(),
          }),
          execute: async ({
            customerId,
            sku,
            quantity,
            unitPriceCents,
            shippingCents,
          }) => ({
            quoteId: `quote-${customerId}-${sku}-${quantity}`,
            totalCents: quantity * unitPriceCents + shippingCents,
            expiresOn: '2026-06-10',
            internalApprovalCode: 'approval-secret',
          }),
        }),
      },
      {
        executionPolicy: {
          timeoutMs: 20_000,
        },
      },
    );

    const result = await generateText({
      model: gateway(HAIKU_MODEL_ID),
      tools: { codeMode },
      toolChoice: { type: 'tool', toolName: 'codeMode' },
      stopWhen: stepCountIs(2),
      temperature: 0,
      maxRetries: 0,
      timeout: { totalMs: 90_000, stepMs: 45_000 },
      prompt: [
        'Make exactly two codeMode calls to create a compact purchasing recommendation.',
        '',
        'First codeMode call:',
        "- Call searchCatalog with { query: 'ergonomic office chair', maxResults: 3 }.",
        "- For each returned product, call getInventory and getPricing with customerId 'cust_42'.",
        '- Return exactly { shortlist: [...] } where each item has sku, name, available, unitPriceCents.',
        '- Do not include internalMarginBps, warehouses, listPriceCents, discountPct, or internalCostCents.',
        '',
        'Second codeMode call after seeing the first result:',
        '- Choose the chair-pro item.',
        "- First await getCustomer with { customerId: 'cust_42' }.",
        '- Do not hard-code the region or quantity.',
        "- After customer is available, call estimateShipping with exactly { sku: 'chair-pro', region: customer.region, quantity: customer.defaultQuantity }.",
        "- Call createQuote with { customerId: customer.id, sku: 'chair-pro', quantity: customer.defaultQuantity, unitPriceCents: 23900, shippingCents: shipping.costCents }.",
        "- Return exactly { quoteId: quote.quoteId, recommendation: { sku: 'chair-pro', quantity: customer.defaultQuantity, totalCents: quote.totalCents, delivery: { carrier: shipping.carrier, etaDays: shipping.etaDays } }, customer: { id: customer.id, tier: customer.tier } }.",
        '- Do not include customer email, route, internal approval code, or other private fields.',
      ].join('\n'),
    });

    writeCodeSamples('multi-turn-quote', result, 2);

    expect(codeModeOutputs(result)).toEqual([
      {
        shortlist: [
          {
            sku: 'chair-basic',
            name: 'Task Chair',
            available: 0,
            unitPriceCents: 19900,
          },
          {
            sku: 'chair-pro',
            name: 'Ergo Chair Pro',
            available: 8,
            unitPriceCents: 23900,
          },
          {
            sku: 'chair-max',
            name: 'Ergo Chair Max',
            available: 3,
            unitPriceCents: 32900,
          },
        ],
      },
      {
        quoteId: 'quote-cust_42-chair-pro-4',
        recommendation: {
          sku: 'chair-pro',
          quantity: 4,
          totalCents: 99800,
          delivery: {
            carrier: 'Vercel Freight',
            etaDays: 3,
          },
        },
        customer: {
          id: 'cust_42',
          tier: 'enterprise',
        },
      },
    ]);
  });
});

type CodeModeToolCall = { toolName: string; input: unknown };
type CodeModeToolResult = { toolName: string; output: unknown };
type CodeModeStep = {
  toolCalls: ReadonlyArray<CodeModeToolCall>;
  toolResults: ReadonlyArray<CodeModeToolResult>;
};
type CodeModeResult = CodeModeStep & {
  steps?: ReadonlyArray<CodeModeStep>;
};

function codeModeOutput(result: CodeModeResult): unknown {
  const outputs = codeModeOutputs(result);
  expect(outputs).toHaveLength(1);
  return outputs[0];
}

function codeModeOutputs(result: CodeModeResult): unknown[] {
  const toolResults = result.steps?.flatMap(step => step.toolResults) ?? [
    ...result.toolResults,
  ];
  const outputs = toolResults
    .filter(item => item.toolName === 'codeMode')
    .map(item => item.output);
  expect(outputs.length).toBeGreaterThan(0);
  return outputs;
}

function writeCodeSample(slug: string, result: CodeModeResult): void {
  const sources = codeModeSources(result);
  expect(sources).toHaveLength(1);
  writeCodeSampleFile(slug, sources[0]!);
}

function writeCodeSamples(
  slug: string,
  result: CodeModeResult,
  expectedCount: number,
): void {
  const sources = codeModeSources(result);
  expect(sources).toHaveLength(expectedCount);

  sources.forEach((source, index) => {
    writeCodeSampleFile(`${slug}-turn-${index + 1}`, source);
  });
}

function writeCodeSampleFile(slug: string, source: string): void {
  validateSlug(slug);
  mkdirSync(CODE_SAMPLES_DIR, { recursive: true });
  writeFileSync(join(CODE_SAMPLES_DIR, `${slug}.ts`), `${source.trim()}\n`);
}

function codeModeSources(result: CodeModeResult): string[] {
  const toolCalls = result.steps?.flatMap(step => step.toolCalls) ?? [
    ...result.toolCalls,
  ];
  const sources = toolCalls
    .filter(item => item.toolName === 'codeMode')
    .map(item => codeModeSource(item));
  expect(sources.length).toBeGreaterThan(0);
  return sources;
}

function codeModeSource(toolCall: CodeModeToolCall): string {
  const input = toolCall.input;
  if (!isRecord(input) || typeof input.js !== 'string') {
    throw new Error('Expected codeMode tool input with a js string.');
  }

  return input.js;
}

function validateSlug(slug: string): void {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Invalid code sample slug: ${slug}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
