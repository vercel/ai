/**
 * Governance Middleware Example — tealtiger-ai-sdk
 *
 * Demonstrates how to add deterministic governance to any AI SDK model
 * using the standard LanguageModelV3Middleware interface.
 *
 * No LLM in the governance path — all evaluation is deterministic (<5ms).
 *
 * Run: npx tsx src/index.ts
 */

import { generateText, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import tealtigerMiddleware from 'tealtiger-ai-sdk';

async function main() {
  // ─── Zero-Config Governance ─────────────────────────────────────────
  // Wrap any model with governance. Zero config enables:
  // - PII detection (email, SSN, credit card, phone)
  // - Prompt injection blocking
  // - Content moderation
  // All in observe mode (passthrough, no blocking)

  const governedModel = wrapLanguageModel({
    model: openai('gpt-4o-mini'),
    middleware: tealtigerMiddleware(),
  });

  console.log('─── Example 1: Zero-Config Observe Mode ───\n');

  const result1 = await generateText({
    model: governedModel,
    prompt: 'What is the capital of France?',
  });

  console.log('Response:', result1.text);
  console.log('(Governance: observed, not blocked)\n');

  // ─── With Policy Enforcement ────────────────────────────────────────

  const enforcedModel = wrapLanguageModel({
    model: openai('gpt-4o-mini'),
    middleware: tealtigerMiddleware({
      guardrails: {
        pii: {
          enabled: true,
          detectTypes: ['email', 'ssn', 'credit_card'],
          action: 'redact',
        },
        promptInjection: {
          enabled: true,
          action: 'block',
          sensitivity: 'high',
        },
      },
      policy: {
        mode: 'ENFORCE',
      },
      costTracking: {
        enabled: true,
        perSessionLimit: 1.0,
      },
    }),
  });

  console.log('─── Example 2: Policy Enforcement ───\n');

  const result2 = await generateText({
    model: enforcedModel,
    prompt: 'Summarize this: Contact john@example.com for details.',
  });

  console.log('Response:', result2.text);
  console.log('(PII "john@example.com" was redacted before reaching the model)\n');

  // ─── With Circuit Breaker ───────────────────────────────────────────

  const resilientModel = wrapLanguageModel({
    model: openai('gpt-4o-mini'),
    middleware: tealtigerMiddleware({
      circuitBreaker: {
        failureThreshold: 3,
        timeout: 30000,
      },
      policy: {
        mode: 'ENFORCE',
      },
    }),
  });

  console.log('─── Example 3: Circuit Breaker ───\n');

  const result3 = await generateText({
    model: resilientModel,
    prompt: 'Hello world',
  });

  console.log('Response:', result3.text);
  console.log('(Circuit breaker active: opens after 3 consecutive failures)\n');

  // ─── Audit Trail ───────────────────────────────────────────────────
  console.log('─── Governance Audit Trail ───\n');
  console.log('All governance decisions are logged with:');
  console.log('- Correlation ID (UUID v4) per request');
  console.log('- Decision: ALLOW / DENY / REDACT');
  console.log('- Risk score (0-100)');
  console.log('- Evaluation time (<5ms)');
  console.log('- Cost tracked per request');
}

main().catch(console.error);
