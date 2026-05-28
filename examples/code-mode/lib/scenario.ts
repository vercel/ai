import { tool } from 'ai';
import { z } from 'zod/v4';
import type { JsonValue, ToolTrace } from './types';

const cases = {
  case_1842: {
    id: 'case_1842',
    customerId: 'cust_91',
    orderId: 'ord_733',
    subject: 'Damaged espresso machine delivered yesterday',
    issue:
      'Customer reports that the espresso machine arrived with a cracked water tank and asks for a refund.',
    openedAt: '2026-05-27T14:30:00.000Z',
  },
};

const customers = {
  cust_91: {
    id: 'cust_91',
    name: 'Ada Lovelace',
    tier: 'pro',
    email: 'ada@example.com',
    signedUpAt: '2023-02-11',
  },
};

const orders = {
  ord_733: {
    id: 'ord_733',
    customerId: 'cust_91',
    product: 'BaristaMax Espresso Machine',
    total: 249,
    status: 'delivered',
    deliveredAt: '2026-05-26',
  },
};

const policies = [
  {
    id: 'policy_damage_refund',
    title: 'Damaged Item Refunds',
    excerpt:
      'Items reported damaged within 14 days of delivery are eligible for a full refund after order verification.',
  },
  {
    id: 'policy_pro_customer',
    title: 'Pro Customer Support',
    excerpt:
      'Pro customers receive priority handling and may be offered expedited replacement or refund resolution.',
  },
  {
    id: 'policy_general_returns',
    title: 'General Returns',
    excerpt:
      'Undamaged items can be returned within 30 days. Return shipping may be deducted from refunds.',
  },
];

const previousTickets = {
  cust_91: [
    {
      id: 'ticket_120',
      subject: 'Asked about grinder compatibility',
      status: 'closed',
      sentiment: 'positive',
    },
    {
      id: 'ticket_141',
      subject: 'Delivery address correction',
      status: 'closed',
      sentiment: 'neutral',
    },
  ],
};

type TraceState = {
  startedAt: number;
  calls: ToolTrace[];
  nextId: number;
};

export function createSupportTools(startedAt: number) {
  const state: TraceState = {
    startedAt,
    calls: [],
    nextId: 1,
  };

  const tools = {
    getCase: tracedTool({
      state,
      name: 'getCase',
      latencyMs: 90,
      description: 'Get a support case by id.',
      inputSchema: z.object({ caseId: z.string() }),
      outputSchema: z.object({
        id: z.string(),
        customerId: z.string(),
        orderId: z.string(),
        subject: z.string(),
        issue: z.string(),
        openedAt: z.string(),
      }),
      execute: async ({ caseId }) =>
        getRequired(cases, caseId, `Unknown case: ${caseId}`),
    }),
    getCustomer: tracedTool({
      state,
      name: 'getCustomer',
      latencyMs: 140,
      description: 'Get customer profile and support tier.',
      inputSchema: z.object({ customerId: z.string() }),
      outputSchema: z.object({
        id: z.string(),
        name: z.string(),
        tier: z.string(),
        email: z.string(),
        signedUpAt: z.string(),
      }),
      execute: async ({ customerId }) =>
        getRequired(customers, customerId, `Unknown customer: ${customerId}`),
    }),
    getOrder: tracedTool({
      state,
      name: 'getOrder',
      latencyMs: 150,
      description: 'Get order status, delivery date, and purchase total.',
      inputSchema: z.object({ orderId: z.string() }),
      outputSchema: z.object({
        id: z.string(),
        customerId: z.string(),
        product: z.string(),
        total: z.number(),
        status: z.string(),
        deliveredAt: z.string(),
      }),
      execute: async ({ orderId }) =>
        getRequired(orders, orderId, `Unknown order: ${orderId}`),
    }),
    searchPolicies: tracedTool({
      state,
      name: 'searchPolicies',
      latencyMs: 180,
      description: 'Search support policies by query.',
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            score: z.number(),
          }),
        ),
      }),
      execute: async ({ limit = 3 }) => ({
        results: policies.slice(0, limit).map((policy, index) => ({
          id: policy.id,
          title: policy.title,
          score: 1 - index * 0.12,
        })),
      }),
    }),
    readPolicy: tracedTool({
      state,
      name: 'readPolicy',
      latencyMs: 110,
      description: 'Read a policy by id.',
      inputSchema: z.object({ id: z.string() }),
      outputSchema: z.object({
        id: z.string(),
        title: z.string(),
        excerpt: z.string(),
      }),
      execute: async ({ id }) =>
        getRequired(
          Object.fromEntries(policies.map(policy => [policy.id, policy])),
          id,
          `Unknown policy: ${id}`,
        ),
    }),
    listPreviousTickets: tracedTool({
      state,
      name: 'listPreviousTickets',
      latencyMs: 160,
      description: 'List recent support tickets for a customer.',
      inputSchema: z.object({ customerId: z.string() }),
      outputSchema: z.object({
        tickets: z.array(
          z.object({
            id: z.string(),
            subject: z.string(),
            status: z.string(),
            sentiment: z.string(),
          }),
        ),
      }),
      execute: async ({ customerId }) => ({
        tickets:
          previousTickets[customerId as keyof typeof previousTickets] ?? [],
      }),
    }),
    calculateRefund: tracedTool({
      state,
      name: 'calculateRefund',
      latencyMs: 130,
      description:
        'Calculate refund eligibility and amount from order and policy ids.',
      inputSchema: z.object({
        orderId: z.string(),
        policyIds: z.array(z.string()),
      }),
      outputSchema: z.object({
        eligible: z.boolean(),
        amount: z.number(),
        reason: z.string(),
        policyIds: z.array(z.string()),
      }),
      execute: async ({ orderId, policyIds }) => {
        const order = orders[orderId as keyof typeof orders];
        const damagedPolicyApplied = policyIds.includes('policy_damage_refund');
        return {
          eligible: damagedPolicyApplied,
          amount: damagedPolicyApplied ? order.total : 0,
          reason: damagedPolicyApplied
            ? 'Damage was reported within 14 days of delivery.'
            : 'No matching refund policy was supplied.',
          policyIds,
        };
      },
    }),
  };

  return { tools, trace: state.calls };
}

export function buildCasePrompt(caseId: string): string {
  return [
    `Resolve support case ${caseId}.`,
    'Determine refund eligibility, cite the relevant policy ids and titles, summarize prior support history, and draft a concise customer-facing reply.',
    'Use the available tools for facts. Do not invent policy details or order data.',
    'End with a short "Metrics note" sentence explaining whether the answer used direct tools or code mode based on the prompt.',
  ].join('\n');
}

function tracedTool<
  INPUT_SCHEMA extends z.ZodType,
  OUTPUT_SCHEMA extends z.ZodType,
>({
  state,
  name,
  latencyMs,
  description,
  inputSchema,
  outputSchema,
  execute,
}: {
  state: TraceState;
  name: string;
  latencyMs: number;
  description: string;
  inputSchema: INPUT_SCHEMA;
  outputSchema: OUTPUT_SCHEMA;
  execute: (input: z.infer<INPUT_SCHEMA>) => Promise<z.infer<OUTPUT_SCHEMA>>;
}) {
  return tool({
    description,
    inputSchema,
    outputSchema,
    execute: async input => {
      const id = state.nextId++;
      const start = performance.now();
      const trace: ToolTrace = {
        id,
        toolName: name,
        input: input as JsonValue,
        startMs: round(start - state.startedAt),
        endMs: round(start - state.startedAt),
        durationMs: 0,
      };
      state.calls.push(trace);

      try {
        await sleep(latencyMs);
        const output = await execute(input as z.infer<INPUT_SCHEMA>);
        const end = performance.now();
        trace.output = (output ?? null) as JsonValue;
        trace.endMs = round(end - state.startedAt);
        trace.durationMs = round(end - start);
        return output;
      } catch (error) {
        const end = performance.now();
        trace.error = error instanceof Error ? error.message : String(error);
        trace.endMs = round(end - state.startedAt);
        trace.durationMs = round(end - start);
        throw error;
      }
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function getRequired<T>(
  values: Record<string, T>,
  key: string,
  message: string,
): T {
  const value = values[key];
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}
