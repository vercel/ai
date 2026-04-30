import * as diagnosticsChannel from 'node:diagnostics_channel';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTelemetryDispatcher } from './create-telemetry-dispatcher';
import {
  AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL,
  type TelemetryDiagnosticChannelMessage,
} from './diagnostic-channel';
import { isNodeRuntime } from '../util/is-node-runtime';

async function collectDiagnosticChannelMessages(
  run: () => Promise<void>,
): Promise<TelemetryDiagnosticChannelMessage[]> {
  const messages: TelemetryDiagnosticChannelMessage[] = [];
  const subscriber = (message: unknown) => {
    messages.push(message as TelemetryDiagnosticChannelMessage);
  };

  diagnosticsChannel.subscribe(AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL, subscriber);

  try {
    await run();
  } finally {
    diagnosticsChannel.unsubscribe(
      AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL,
      subscriber,
    );
  }

  return messages;
}

describe.runIf(isNodeRuntime())(
  'diagnostic channel telemetry publisher',
  () => {
    beforeEach(() => {
      globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
    });

    it('publishes lifecycle events even when no integrations are configured', async () => {
      const event = { callId: 'diagnostic-channel-without-integrations' };

      const messages = await collectDiagnosticChannelMessages(async () => {
        const telemetry = createTelemetryDispatcher({});

        await telemetry.onStart!(event as any);
      });

      expect(messages).toMatchInlineSnapshot(`
      [
        {
          "event": {
            "callId": "diagnostic-channel-without-integrations",
            "functionId": undefined,
            "recordInputs": undefined,
            "recordOutputs": undefined,
          },
          "type": "onStart",
        },
      ]
    `);
    });

    it('does not publish lifecycle events when telemetry is disabled', async () => {
      const event = { callId: 'diagnostic-channel-disabled' };

      const messages = await collectDiagnosticChannelMessages(async () => {
        const telemetry = createTelemetryDispatcher({
          telemetry: { isEnabled: false },
        });

        await telemetry.onStart?.(event as any);
      });

      expect(
        messages.filter(message => {
          return (message.event as { callId?: string }).callId === event.callId;
        }),
      ).toEqual([]);
    });

    it('applies telemetry settings per call', async () => {
      const enabledEvent = { callId: 'diagnostic-channel-enabled-call' };
      const disabledEvent = { callId: 'diagnostic-channel-disabled-call' };

      const messages = await collectDiagnosticChannelMessages(async () => {
        const enabledTelemetry = createTelemetryDispatcher({
          telemetry: { functionId: 'enabled-function' },
        });
        const disabledTelemetry = createTelemetryDispatcher({
          telemetry: { isEnabled: false, functionId: 'disabled-function' },
        });

        await disabledTelemetry.onStart?.(disabledEvent as any);
        await enabledTelemetry.onStart!(enabledEvent as any);
      });

      expect(
        messages.filter(message => {
          const callId = (message.event as { callId?: string }).callId;
          return (
            callId === enabledEvent.callId || callId === disabledEvent.callId
          );
        }),
      ).toMatchInlineSnapshot(`
      [
        {
          "event": {
            "callId": "diagnostic-channel-enabled-call",
            "functionId": "enabled-function",
            "recordInputs": undefined,
            "recordOutputs": undefined,
          },
          "type": "onStart",
        },
      ]
    `);
    });
  },
);
