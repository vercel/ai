import { Message } from '@/util/chat-schema';

export default function MessageView({ message }: { message: Message }) {
  const date = message.metadata?.createdAt
    ? new Date(message.metadata.createdAt).toLocaleString()
    : '';
  const isUser = message.role === 'user';

  return (
    <div
      className={`whitespace-pre-wrap my-2 p-3 rounded-lg shadow
        ${isUser ? 'bg-blue-100 text-right ml-10' : 'bg-gray-100 text-left mr-10'}`}
    >
      <div className="mb-1 text-xs text-gray-500">{date}</div>
      <div className="font-semibold">{isUser ? 'User:' : 'AI:'}</div>
      <div>
        {message.parts.map((part, index) => {
          if (part.type === 'text') {
            return part.text;
          }

          if (part.type === 'data-weather') {
            if (part.data.status === 'generating') {
              return (
                <div
                  key={index}
                  className="p-2 mt-2 border border-gray-200 rounded bg-gray-50"
                >
                  <div className="text-gray-600">
                    Generating weather data...
                  </div>
                </div>
              );
            }

            if (part.data.status === 'calling api') {
              return (
                <div
                  key={index}
                  className="p-2 mt-2 border border-gray-200 rounded bg-gray-50"
                >
                  <div className="text-gray-600">Calling weather API...</div>
                </div>
              );
            }

            const { temperatureInCelsius, weather, city } = part.data.weather;
            return (
              <div
                key={index}
                className="p-2 mt-2 border border-blue-200 rounded bg-blue-50"
              >
                <div className="font-medium text-blue-800">
                  Weather in {city}
                </div>
                <div className="text-blue-600">{weather}</div>
                <div className="font-semibold text-blue-700">
                  {temperatureInCelsius}°C
                </div>
              </div>
            );
          }

          return '';
        })}
      </div>
    </div>
  );
}
