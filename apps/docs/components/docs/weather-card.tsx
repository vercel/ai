interface Weather {
  temperature: number;
  condition: string;
}

const hourlyForecast = [
  { time: '7am', temperature: 48 },
  { time: '8am', temperature: 50 },
  { time: '9am', temperature: 52 },
  { time: '10am', temperature: 54 },
  { time: '11am', temperature: 56 },
  { time: '12pm', temperature: 58 },
  { time: '1pm', temperature: 60 },
];

const Sunny = () => <div className="size-6 rounded-full bg-amber-300" />;

const Cloudy = () => (
  <div className="relative">
    <div className="size-6 rounded-full bg-amber-300" />
    <div className="-right-1 absolute bottom-0 h-3 w-4 rounded-full bg-blue-200" />
  </div>
);

/**
 * Weather card rendered inside simulated chat replies in cookbook demos
 * (ported from the legacy ai-sdk.dev app).
 */
export const WeatherCard = ({ content }: { content: { weather: Weather } }) => {
  const { temperature, condition } = content.weather;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-blue-700 p-4 text-white">
      <div className="flex flex-row justify-between">
        <div>
          <div className="mb-1 text-sm capitalize opacity-80">
            Thursday, March 7
          </div>
          <div className="flex flex-row items-center gap-2">
            <div className="text-4xl">{temperature}°</div>
            <div className="size-8 rounded-full bg-amber-300" />
          </div>
        </div>
        <div>
          <div className="text-sm capitalize opacity-90">{condition}</div>
        </div>
      </div>
      <div className="flex flex-row justify-between">
        {hourlyForecast.map(weatherAtTime => (
          <div className="flex flex-col items-center" key={weatherAtTime.time}>
            <div className="mb-2 text-xs opacity-75">{weatherAtTime.time}</div>
            {weatherAtTime.temperature < 54 ? <Sunny /> : <Cloudy />}
            <div className="mt-1 text-xs">{weatherAtTime.temperature}°</div>
          </div>
        ))}
      </div>
    </div>
  );
};
