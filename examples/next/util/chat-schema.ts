import { UIMessage } from 'ai';
import { z } from 'zod/v4';

export const myMessageMetadataSchema = z.object({
  createdAt: z.number(),
});

export type MyMessageMetadata = z.infer<typeof myMessageMetadataSchema>;

export const weatherDataPartSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('generating'),
  }),
  z.object({
    status: z.literal('calling api'),
  }),
  z.object({
    status: z.literal('available'),
    weather: z.object({
      city: z.string(),
      weather: z.string(),
      temperatureInCelsius: z.number(),
    }),
  }),
]);

export type MyDataPartSchemas = {
  weather: z.infer<typeof weatherDataPartSchema>;
};

export type MyUIMessage = UIMessage<MyMessageMetadata, MyDataPartSchemas>;

export type ChatData = {
  id: string;
  messages: MyUIMessage[];
  createdAt: number;
};
