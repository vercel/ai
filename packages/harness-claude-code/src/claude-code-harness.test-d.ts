import type {
  HarnessAgentAdapter,
  HarnessAgentSettings,
} from '@ai-sdk/harness/agent';
import type { HarnessV1QuestionsToolOutput } from '@ai-sdk/harness';
import type { InferToolInput, InferToolOutput } from '@ai-sdk/provider-utils';
import { assertType, describe, expectTypeOf, test } from 'vitest';
import { claudeCode, createClaudeCode } from './index';

/*
 * Regression guard for the harness Zod compatibility contract: a concrete
 * `HarnessV1` adapter (with its real, schema-typed `builtinTools`) must stay
 * assignable to the type `HarnessAgent` expects for its `harness` setting,
 * independent of which supported Zod version the consumer has installed. The
 * adapter's tool input schemas are normalized to `FlexibleSchema` by `tool()`,
 * so no concrete Zod-version type should leak into this surface.
 */
describe('claudeCode ↔ HarnessAgent harness setting', () => {
  test('claudeCode satisfies the HarnessAgent adapter constraint', () => {
    expectTypeOf(claudeCode).toExtend<HarnessAgentAdapter<any>>();
    expectTypeOf(createClaudeCode()).toExtend<HarnessAgentAdapter<any>>();
  });

  test('claudeCode is assignable to the HarnessAgent `harness` setting', () => {
    assertType<HarnessAgentSettings['harness']>(claudeCode);
    assertType<HarnessAgentSettings['harness']>(createClaudeCode());
  });

  test('the constructor generic constraint accepts claudeCode', () => {
    // Mirrors `HarnessAgent`'s `THarness extends HarnessAgentAdapter<any>`.
    const acceptsHarness = <THarness extends HarnessAgentAdapter<any>>(
      harness: THarness,
    ): THarness => harness;

    assertType<typeof claudeCode>(acceptsHarness(claudeCode));
  });

  test('new built-in tool inputs retain their schema types', () => {
    assertType<InferToolInput<typeof claudeCode.builtinTools.CronCreate>>({
      cron: '0 9 * * *',
      prompt: 'Prepare the daily summary.',
      recurring: true,
    });
    assertType<InferToolInput<typeof claudeCode.builtinTools.SendMessage>>({
      to: 'reviewer',
      message: {
        type: 'plan_approval_response',
        request_id: 'request-1',
        approve: false,
        feedback: 'Add a regression test.',
      },
    });
  });

  test('the question tool retains its output type', () => {
    expectTypeOf<
      InferToolOutput<typeof claudeCode.builtinTools.askUserQuestions>
    >().toEqualTypeOf<HarnessV1QuestionsToolOutput>();
  });

  test('canonical and legacy MCP names remain available', () => {
    assertType(claudeCode.builtinTools.ListMcpResources);
    assertType(claudeCode.builtinTools.ListMcpResourcesTool);
    assertType(claudeCode.builtinTools.ReadMcpResource);
    assertType(claudeCode.builtinTools.ReadMcpResourceTool);
  });

  test('createClaudeCode accepts environment configuration', () => {
    expectTypeOf(
      createClaudeCode({
        env: { DEPLOYMENT_ENV: 'staging' },
      }),
    ).toExtend<HarnessAgentAdapter<any>>();
  });

  test('createClaudeCode accepts asynchronous credential forwarding', () => {
    expectTypeOf(
      createClaudeCode({
        credentialForwarding: async ({ credential }) => credential,
      }),
    ).toExtend<HarnessAgentAdapter<any>>();
  });
});
