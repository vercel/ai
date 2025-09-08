import type { WeatherToolUIContent } from '@/tool/weather-tool';

export default function WeatherView({ part }: { part: WeatherToolUIContent }) {
  switch (part.state) {
    // example of pre-rendering streaming tool calls:
    case 'input-streaming':
      return <pre>{JSON.stringify(part.input, null, 2)}</pre>;
    case 'input-available':
      return (
        <div className="text-gray-500">
          Getting weather information for {part.input.city}...
        </div>
      );
    case 'output-available':
      return (
        <div className="text-gray-500">
          {part.output.state === 'loading'
            ? 'Fetching weather information...'
            : `Weather in ${part.input.city}: ${part.output.weather}`}
        </div>
      );
    case 'output-error':
      return <div className="text-red-500">Error: {part.errorText}</div>;
  }
}
