import type * as diagnosticsChannelModule from 'node:diagnostics_channel';
import {
  AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL,
  type TelemetryDiagnosticChannelMessage,
} from './diagnostic-channel';

type DiagnosticsChannel = typeof diagnosticsChannelModule;

let diagnosticsChannelPromise:
  | Promise<DiagnosticsChannel | undefined>
  | undefined;

function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && process.release?.name === 'node';
}

async function loadDiagnosticsChannel(): Promise<
  DiagnosticsChannel | undefined
> {
  if (!isNodeRuntime()) {
    return undefined;
  }

  if (diagnosticsChannelPromise == null) {
    diagnosticsChannelPromise = (
      Function(
        'return import("node:diagnostics_channel")',
      )() as Promise<DiagnosticsChannel>
    ).catch(() => undefined);
  }

  return diagnosticsChannelPromise;
}

export async function publishTelemetryDiagnosticChannelMessage(
  message: TelemetryDiagnosticChannelMessage,
): Promise<void> {
  const diagnosticsChannel = await loadDiagnosticsChannel();

  if (
    diagnosticsChannel?.hasSubscribers(AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL) !==
    true
  ) {
    return;
  }

  try {
    diagnosticsChannel
      .channel(AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL)
      .publish(message);
  } catch {}
}
