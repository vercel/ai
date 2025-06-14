import { UIMessage } from 'ai';

export type WeatherDataPart =
  | { status: 'generating' }
  | { status: 'calling api' }
  | {
      status: 'available';
      weather: {
        city: string;
        weather: string;
        temperatureInCelsius: number;
      };
    };

export type Message = UIMessage<
  {
    createdAt: number;
  },
  {
    weather: WeatherDataPart;
  },
  {
    getWeatherInformation: {
      args: { city: string };
      result: {
        city: string;
        weather: string;
        temperatureInCelsius: number;
      };
    };
  }
>;

export type ChatData = {
  id: string;
  messages: Message[];
  createdAt: number;
};
