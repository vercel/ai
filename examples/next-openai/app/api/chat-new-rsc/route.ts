// 'What is the temperature in SF?'
async function getWeatherInfo(messages) {
  'use server';

  const stream = await streamMessage({
    model: openai.chat({
      modelId: 'gpt-3.5-turbo',
    }),

    tools: [
      // the tool can be extract and defined elsewhere
      new Tool({
        name: 'get_city_temperature',
        // we could do something else here, zod has a nice way to convert to json schema tho
        parameters: zodSchema(z.object({ city: z.string() })),
        execute: getWeatherInfo,
      }),
    ],

    prompt: {
      system:
        'You are a helpful assistant that can provide weather information for a given city.',
      messages,
    },
  });

  return stream.toStreamingReactResponse(streamPart => {
    switch (streamPart.type) {
      case 'text-delta': {
        return streamPart.textDelta;
      }

      case 'tool-call': {
        if (streamPart.tool === 'get_city_temperature') {
          if (!streamPart.args.city) {
            return <CityPicker />;
          }

          return <Loading />;
        }
      }

      case 'tool-result': {
        if (streamPart.tool === 'get_city_temperature') {
          return <Weather info={streamPart.result} />;
        }
      }
    }
  });
}
