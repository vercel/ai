import {
  getTelemetryEvents,
  type TelemetryScenario,
} from '@/lib/telemetry-store';

const expectations: Record<TelemetryScenario, string[]> = {
  'happy-path': [
    'onStart',
    'onStepStart',
    'onLanguageModelCallStart',
    'onLanguageModelCallEnd',
    'onChunk',
    'onToolExecutionStart',
    'onToolExecutionEnd',
    'onStepFinish',
    'onFinish',
  ],
  'context-filtering': [
    'onStart',
    'onStepStart',
    'onToolExecutionStart',
    'onToolExecutionEnd',
    'onFinish',
  ],
  approval: [
    'onStart',
    'onStepStart',
    'onLanguageModelCallStart',
    'onLanguageModelCallEnd',
    'onChunk',
    'onFinish',
  ],
  'tool-error': [
    'onStart',
    'onToolExecutionStart',
    'onToolExecutionEnd',
    'onFinish',
  ],
  'model-error': ['onStart', 'onLanguageModelCallStart', 'onError'],
  reconnect: [
    'onStart',
    'onStepStart',
    'onChunk',
    'onFinish',
    'transport:postStreamInterrupted',
    'transport:reconnectStream',
  ],
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ telemetryRunId: string }> },
) {
  const { telemetryRunId } = await params;
  const scenario =
    (new URL(request.url).searchParams.get(
      'scenario',
    ) as TelemetryScenario | null) ?? 'happy-path';
  const events = getTelemetryEvents(telemetryRunId);

  return Response.json({
    telemetryRunId,
    scenario,
    events,
    expectations: expectations[scenario].map(name => {
      const [source, eventName] = name.includes(':')
        ? name.split(':')
        : ['telemetry', name];
      return {
        name,
        met: events.some(
          event => event.source === source && event.name === eventName,
        ),
      };
    }),
    contextFiltering: {
      includesAllowedRuntimeContext: JSON.stringify(events).includes(
        'tenant_telemetry_e2e',
      ),
      excludesRuntimeSecret: !JSON.stringify(events).includes(
        'runtime-secret-not-for-telemetry',
      ),
      excludesToolSecret:
        !JSON.stringify(events).includes('weather-secret-not-for-telemetry') &&
        !JSON.stringify(events).includes('delete-secret-not-for-telemetry'),
    },
  });
}
