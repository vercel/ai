import { UIDataTypes, UIMessage } from 'ai';
import { z } from 'zod';

export const myMessageMetadataSchema = z.object({
  createdAt: z.number(),
});

export type MyMessageMetadata = z.infer<typeof myMessageMetadataSchema>;

export const weatherDataPartSchema = z.object({
  status: z.enum(['generating', 'available']),
  result: z
    .object({
      city: z.string(),
      weather: z.string(),
      temperatureInCelsius: z.number(),
    })
    .optional(),
});

export type MyDataPartSchemas = {
  weather: z.infer<typeof weatherDataPartSchema>;
};

export type MyUIMessage = UIMessage<MyMessageMetadata, MyDataPartSchemas>;

export type ChatData = {
  id: string;
  messages: MyUIMessage[];
  createdAt: number;
};
