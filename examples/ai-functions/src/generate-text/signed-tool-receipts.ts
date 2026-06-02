import { openai } from '@ai-sdk/openai';
import {
  generateText,
  isStepCount,
  tool,
  type ToolExecutionEndEvent,
  type ToolExecutionStartEvent,
  type ToolSet,
} from 'ai';
import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';
import { run } from '../lib/run';

// This example keeps the receipt signer dependency-free with HMAC-SHA256.
// For third-party/offline verification, replace signReceipt with an
// asymmetric signature such as Ed25519 and publish the verification key.

type ReceiptPhase = 'pre-execution' | 'post-execution';

type ToolReceipt = {
  receiptVersion: 'ai-sdk-tool-receipt-v0';
  sequence: number;
  phase: ReceiptPhase;
  callId: string;
  toolName: string;
  toolCallId: string;
  inputDigest: string;
  outputDigest?: string;
  errorDigest?: string;
  toolExecutionMs?: number;
  previousReceiptHash?: string;
  issuedAt: string;
  signature?: {
    alg: 'HMAC-SHA256';
    kid: string;
    sig: string;
  };
};

const receiptChain: ToolReceipt[] = [];
const secretKey = Buffer.from('demo-signing-key-replace-me');

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }

  return value;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function unsignedPayload(receipt: ToolReceipt): Omit<ToolReceipt, 'signature'> {
  const { signature: _signature, ...payload } = receipt;
  return payload;
}

function receiptHash(receipt: ToolReceipt): string {
  return digest(unsignedPayload(receipt));
}

function signReceipt(receipt: ToolReceipt): ToolReceipt {
  const sig = createHmac('sha256', secretKey)
    .update(canonicalJson(unsignedPayload(receipt)))
    .digest('hex');

  return {
    ...receipt,
    signature: {
      alg: 'HMAC-SHA256',
      kid: 'demo-key-1',
      sig,
    },
  };
}

function appendReceipt(
  receipt: Omit<
    ToolReceipt,
    'sequence' | 'previousReceiptHash' | 'issuedAt' | 'receiptVersion'
  >,
): ToolReceipt {
  const signed = signReceipt({
    receiptVersion: 'ai-sdk-tool-receipt-v0',
    sequence: receiptChain.length + 1,
    previousReceiptHash:
      receiptChain.length > 0 ? receiptHash(receiptChain.at(-1)!) : undefined,
    issuedAt: new Date().toISOString(),
    ...receipt,
  });

  receiptChain.push(signed);
  return signed;
}

function verifyReceiptChain(receipts: ToolReceipt[]): boolean {
  let previousReceiptHash: string | undefined;

  for (const receipt of receipts) {
    if (receipt.previousReceiptHash !== previousReceiptHash) {
      return false;
    }

    const expected = createHmac('sha256', secretKey)
      .update(canonicalJson(unsignedPayload(receipt)))
      .digest('hex');

    if (receipt.signature?.sig !== expected) {
      return false;
    }

    previousReceiptHash = receiptHash(receipt);
  }

  return true;
}

function receiptCallbacks<TOOLS extends ToolSet>() {
  return {
    onToolExecutionStart(event: ToolExecutionStartEvent<TOOLS>) {
      const receipt = appendReceipt({
        phase: 'pre-execution',
        callId: event.callId,
        toolName: event.toolCall.toolName,
        toolCallId: event.toolCall.toolCallId,
        inputDigest: digest(event.toolCall.input),
      });

      console.log(
        `[receipt] pre  #${receipt.sequence} ${receipt.toolName}: ${receiptHash(receipt)}`,
      );
    },

    onToolExecutionEnd(event: ToolExecutionEndEvent<TOOLS>) {
      const receipt = appendReceipt({
        phase: 'post-execution',
        callId: event.callId,
        toolName: event.toolCall.toolName,
        toolCallId: event.toolCall.toolCallId,
        inputDigest: digest(event.toolCall.input),
        outputDigest:
          event.toolOutput.type === 'tool-result'
            ? digest(event.toolOutput.output)
            : undefined,
        errorDigest:
          event.toolOutput.type === 'tool-error'
            ? digest(String(event.toolOutput.error))
            : undefined,
        toolExecutionMs: event.toolExecutionMs,
      });

      console.log(
        `[receipt] post #${receipt.sequence} ${receipt.toolName}: ${receiptHash(receipt)}`,
      );
    },
  };
}

const tools = {
  getInvoice: tool({
    description: 'Look up an invoice by ID.',
    inputSchema: z.object({ invoiceId: z.string() }),
    execute: async ({ invoiceId }) => ({
      invoiceId,
      customer: 'Acme Co',
      amountUsd: 125,
      status: 'paid',
    }),
  }),
  draftRefund: tool({
    description: 'Draft a refund for an invoice.',
    inputSchema: z.object({ invoiceId: z.string(), amountUsd: z.number() }),
    execute: async ({ invoiceId, amountUsd }) =>
      `Drafted refund for ${invoiceId}: $${amountUsd}`,
  }),
} satisfies ToolSet;

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o'),
    tools,
    stopWhen: isStepCount(5),
    prompt: 'Look up invoice INV-1001 and draft a refund for the full amount.',
    ...receiptCallbacks<typeof tools>(),
  });

  console.log('\nFinal response:');
  console.log(result.text);
  console.log('\nReceipt chain valid:', verifyReceiptChain(receiptChain));
  console.log(JSON.stringify(receiptChain, null, 2));
});
