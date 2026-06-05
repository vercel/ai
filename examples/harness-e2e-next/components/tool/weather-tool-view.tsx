import type { WeatherUIToolInvocation } from '@/lib/tools/weather-tool';
import HarnessToolView from '@/components/tool/harness-tool-view';

export default function WeatherView({
  invocation,
}: {
  invocation: WeatherUIToolInvocation;
}) {
  return (
    <HarnessToolView
      toolName="Weather"
      toolArg={invocation.input?.city}
      state={invocation.state}
      output={
        invocation.output?.state === 'loading'
          ? 'Fetching weather information...'
          : `Weather in ${invocation.input?.city}: ${invocation.output?.weather} (temperature: ${invocation.output?.temperature}°)`
      }
      errorText={invocation.errorText}
    />
  );
}
