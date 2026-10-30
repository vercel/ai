import {
  HarnessAgent,
  type HarnessAgentAdapter,
  type HarnessAgentSettings,
} from '@ai-sdk/harness/agent';
import type { HarnessV1QuestionsToolOutput } from '@ai-sdk/harness';
import type { SandboxChannelReconnectOptions } from '@ai-sdk/harness/utils';
import type { InferToolInput, InferToolOutput } from '@ai-sdk/provider-utils';
import { assertType, describe, expectTypeOf, test } from 'vitest';
import {
  claudeCode,
  createClaudeCode,
  type ClaudeCodeHarnessSettings,
} from './index';

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
    assertType<InferToolInput<typeof claudeCode.builtinTools.ListAgents>>({
      channel: 'reviewers',
      q: 'available',
    });
    assertType<InferToolOutput<typeof claudeCode.builtinTools.ListAgents>>({
      listing: 'reviewer',
    });
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

  test('ListAgents can be disabled without a type cast', () => {
    new HarnessAgent({
      harness: claudeCode,
      inactiveTools: ['ListAgents'],
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

  test('createClaudeCode accepts skill overrides', () => {
    const skillOverrides = {
      'enabled-skill': 'on',
      'name-only-skill': 'name-only',
      'user-invocable-skill': 'user-invocable-only',
      'disabled-skill': 'off',
    } as const;

    expectTypeOf(createClaudeCode({ skillOverrides })).toExtend<
      HarnessAgentAdapter<any>
    >();
    // @ts-expect-error - Claude Code only accepts its supported skill override modes
    createClaudeCode({ skillOverrides: { init: 'disabled' } });
    // @ts-expect-error - arbitrary Claude Code settings are not part of this API
    createClaudeCode({ settings: { skillOverrides: { init: 'off' } } });
  });

  test('createClaudeCode accepts question timeout and dynamic section settings', () => {
    const settings: ClaudeCodeHarnessSettings = {
      questionTimeoutMs: 600_000,
      excludeDynamicSections: true,
    };
    createClaudeCode(settings);
    expectTypeOf(settings.questionTimeoutMs).toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf(settings.excludeDynamicSections).toEqualTypeOf<
      boolean | undefined
    >();
  });

  test('createClaudeCode accepts sandbox bridge reconnect settings', () => {
    const settings: ClaudeCodeHarnessSettings = {
      reconnect: {
        maxElapsedMs: 120_000,
        initialDelayMs: 100,
        maxDelayMs: 5_000,
      },
    };
    createClaudeCode(settings);
    expectTypeOf(settings.reconnect).toEqualTypeOf<
      SandboxChannelReconnectOptions | undefined
    >();
  });
});
