import { GetWeatherUIToolInvocation } from '@/agent/anthropic-tool-search-agent';

export default function GetWeatherView({
  invocation,
}: {
  invocation: GetWeatherUIToolInvocation;
}) {
  switch (invocation.state) {
    case 'input-available': {
      return (
        <div className="flex flex-col gap-2 p-3 bg-sky-50 rounded border-l-4 border-sky-400 shadow">
          <div className="flex items-center font-semibold text-sky-700">
            <span className="inline-block mr-2 bg-sky-200 text-sky-900 rounded px-2 py-0.5 text-xs font-mono tracking-wider">
              WEATHER
            </span>
            Fetching weather data...
          </div>
          <div className="pl-5 text-sm text-sky-800">
            <span className="font-semibold">Location:</span>{' '}
            <span className="inline-block bg-white border border-sky-100 rounded px-2 py-0.5 font-mono">
              {invocation.input.location}
            </span>
          </div>
        </div>
      );
    }
    case 'output-available': {
      const output = invocation.output;
      return (
        <div className="flex flex-col gap-2 p-3 bg-sky-50 rounded border-l-4 border-sky-400 shadow">
          <div className="flex items-center font-semibold text-sky-700">
            <span className="inline-block mr-2 bg-sky-200 text-sky-900 rounded px-2 py-0.5 text-xs font-mono tracking-wider">
              WEATHER
            </span>
            Weather in {output.location}
          </div>
          <div className="pl-5 grid grid-cols-2 gap-2 text-sm text-sky-800">
            <div>
              <span className="font-semibold">Temperature:</span>{' '}
              <span className="font-mono">
                {output.temperature}°
                {invocation.input.unit === 'celsius' ? 'C' : 'F'}
              </span>
            </div>
            <div>
              <span className="font-semibold">Condition:</span>{' '}
              <span className="font-mono">{output.condition}</span>
            </div>
            <div>
              <span className="font-semibold">Humidity:</span>{' '}
              <span className="font-mono">{output.humidity}%</span>
            </div>
          </div>
        </div>
      );
    }

    case 'output-error':
      return (
        <div className="flex flex-col gap-2 p-3 bg-red-50 rounded border-l-4 border-red-400 shadow">
          <div className="flex items-center font-semibold text-red-700">
            <span className="inline-block mr-2 bg-red-200 text-red-900 rounded px-2 py-0.5 text-xs font-mono tracking-wider">
              WEATHER
            </span>
            Error
          </div>
          <div className="pl-5 text-sm text-red-600">
            {invocation.errorText}
          </div>
        </div>
      );
  }
}
