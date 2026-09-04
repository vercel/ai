import type { HarnessV1, HarnessV1SandboxProvider } from '../v1';
import type { HarnessAgentSettings } from './harness-agent-settings';
import type { HarnessAllTools } from './harness-agent-tool-types';
import { tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, test } from 'vitest';
import { z } from 'zod/v4';

const builtinTools = {
  bash: tool({
    inputSchema: z.object({ command: z.string() }),
  }),
};

const harness = {
  specificationVersion: 'harness-v1',
  harnessId: 'mock',
  builtinTools,
  doStart: async () => undefined as never,
} satisfies HarnessV1<typeof builtinTools>;

const userTools = {
  echo: tool({
    inputSchema: z.object({ value: z.string() }),
  }),
};

const sandbox = undefined as never as HarnessV1SandboxProvider;

type Settings = HarnessAgentSettings<typeof harness, typeof userTools>;

describe('HarnessAgentSettings tool filtering types', () => {
  test('lifecycle callbacks use merged tools and runtime context', () => {
    type RuntimeContext = { tenantId: string };
    type LifecycleSettings = HarnessAgentSettings<
      typeof harness,
      typeof userTools,
      RuntimeContext
    >;
    const settings: LifecycleSettings = {
      harness,
      tools: userTools,
      onStart: event => {
        expectTypeOf(event.runtimeContext).toEqualTypeOf<RuntimeContext>();
        expectTypeOf(event.tools).toMatchTypeOf<
          HarnessAllTools<typeof harness, typeof userTools> | undefined
        >();
      },
      onStepStart: event => {
        expectTypeOf(event.runtimeContext).toEqualTypeOf<RuntimeContext>();
      },
      onLanguageModelCallStart: event => {
        expectTypeOf(event.modelId).toEqualTypeOf<string>();
      },
      onLanguageModelCallEnd: event => {
        expectTypeOf(event.content).toMatchTypeOf<readonly unknown[]>();
      },
      onToolExecutionStart: event => {
        if (event.toolCall.toolName === 'echo') {
          expectTypeOf(event.toolCall.input).not.toBeAny();
        }
      },
      onToolExecutionEnd: event => {
        expectTypeOf(event.toolCall.toolName).toEqualTypeOf<string>();
      },
      onStepEnd: event => {
        expectTypeOf(event.runtimeContext).toEqualTypeOf<RuntimeContext>();
      },
      onEnd: event => {
        expectTypeOf(
          event.finalStep.runtimeContext,
        ).toEqualTypeOf<RuntimeContext>();
      },
    };

    expectTypeOf(settings).toMatchTypeOf<LifecycleSettings>();
  });

  test('deprecated lifecycle aliases are not settings', () => {
    const settings: Settings = {
      harness,
      // @ts-expect-error deprecated lifecycle aliases are call-only
      onFinish: () => {},
    };

    expectTypeOf(settings).toMatchTypeOf<Settings>();
  });

  test('call options are typed by the appended generic', () => {
    type CallOptions = { tenant: string };
    type CallSettings = HarnessAgentSettings<
      typeof harness,
      typeof userTools,
      Record<string, never>,
      never,
      CallOptions
    >;
    const settings: CallSettings = {
      harness,
      tools: userTools,
      callOptionsSchema: z.object({ tenant: z.string() }),
      prepareCall: ({ options, ...rest }) => {
        expectTypeOf(options).toEqualTypeOf<CallOptions>();
        return {
          ...rest,
          instructions: `Serve ${options.tenant}`,
        };
      },
    };

    expectTypeOf(settings).toMatchTypeOf<CallSettings>();
  });

  test('sandbox provider is optional', () => {
    const settings: Settings = {
      harness,
      tools: userTools,
    };

    expectTypeOf(settings).toMatchTypeOf<Settings>();
  });

  test('model accepts any string', () => {
    const settings: Settings = {
      harness,
      model: 'harness-specific-model',
    };

    expectTypeOf(settings.model).toEqualTypeOf<string | undefined>();
  });

  test('headers accept undefined values', () => {
    const settings: Settings = {
      harness,
      headers: {
        'x-tenant': 'acme',
        'x-optional': undefined,
      },
    };

    expectTypeOf(settings.headers).toEqualTypeOf<
      Record<string, string | undefined> | undefined
    >();
  });

  test('prepareCall cannot modify headers', () => {
    const settings: Settings = {
      harness,
      headers: { 'x-tenant': 'acme' },
      prepareCall: call => {
        // @ts-expect-error headers are stable construction-time settings
        call.headers;
        return call;
      },
    };

    expectTypeOf(settings).toMatchTypeOf<Settings>();
  });

  test('activeTools accepts builtin and user tool names', () => {
    const settings: Settings = {
      harness,
      tools: userTools,
      activeTools: ['bash', 'echo'],
      sandbox,
    };

    expectTypeOf(settings).toMatchTypeOf<Settings>();
  });

  test('inactiveTools accepts builtin and user tool names', () => {
    const settings: Settings = {
      harness,
      tools: userTools,
      inactiveTools: ['bash', 'echo'],
      sandbox,
    };

    expectTypeOf(settings).toMatchTypeOf<Settings>();
  });

  test('unknown tool names are rejected', () => {
    const settings: Settings = {
      harness,
      tools: userTools,
      // @ts-expect-error activeTools only accepts configured tool names
      activeTools: ['missing'],
      sandbox,
    };

    expectTypeOf(settings).toMatchTypeOf<Settings>();
  });

  test('activeTools and inactiveTools are mutually exclusive', () => {
    // @ts-expect-error activeTools and inactiveTools cannot be combined
    const settings: Settings = {
      harness,
      tools: userTools,
      activeTools: ['echo'],
      inactiveTools: ['bash'],
      sandbox,
    };

    expectTypeOf(settings).toMatchTypeOf<Settings>();
  });

  test('stopWhen accepts one or multiple predicates with merged tools', () => {
    type RuntimeContext = { tenantId: string };
    type RuntimeSettings = HarnessAgentSettings<
      typeof harness,
      typeof userTools,
      RuntimeContext
    >;
    const predicate: NonNullable<RuntimeSettings['stopWhen']> = ({ steps }) => {
      expectTypeOf(steps[0]!.runtimeContext).toEqualTypeOf<RuntimeContext>();
      expectTypeOf(steps[0]!.staticToolCalls[0]!.toolName).toMatchTypeOf<
        'bash' | 'echo'
      >();
      return false;
    };

    const single: RuntimeSettings = {
      harness,
      tools: userTools,
      sandbox,
      stopWhen: predicate,
    };
    const multiple: RuntimeSettings = {
      harness,
      tools: userTools,
      sandbox,
      stopWhen: [predicate],
    };

    expectTypeOf(single).toMatchTypeOf<RuntimeSettings>();
    expectTypeOf(multiple).toMatchTypeOf<RuntimeSettings>();
  });
});
