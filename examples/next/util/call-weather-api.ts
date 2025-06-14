const weatherOptions = ['sunny', 'cloudy', 'rainy', 'windy'];

export async function callWeatherApi({ city }: { city: string }) {
  // Add artificial delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  let weather =
    weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
  const temperatureInCelsius = Math.floor(Math.random() * 50 - 15);

  if (weather === 'rainy' && temperatureInCelsius < 0) {
    weather = 'snowy';
  }

  return {
    city,
    weather,
    temperatureInCelsius,
  };
}
