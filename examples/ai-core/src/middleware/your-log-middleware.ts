import type { LanguageModelV2Middleware, LanguageModelV2StreamPart } from 'ai';

export const yourLogMiddleware: LanguageModelV2Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    console.log('doGenerate called');
    console.log(`params: ${JSON.stringify(params, null, 2)}`);

    const result = await doGenerate();

    console.log('doGenerate finished');
    console.log(`generated text: ${result.text}`);

    return result;
  },

  wrapStream: async ({ doStream, params }) => {
    console.log('doStream called');
    console.log(`params: ${JSON.stringify(params, null, 2)}`);

    const { stream, ...rest } = await doStream();

    let generatedText = '';

    const transformStream = new TransformStream<
      LanguageModelV2StreamPart,
      LanguageModelV2StreamPart
    >({
      transform(chunk, controller) {
        if (chunk.type === 'text-delta') {
          generatedText += chunk.textDelta;
        }

        controller.enqueue(chunk);
      },

      flush() {
        console.log('doStream finished');
        console.log(`generated text: ${generatedText}`);
      },
    });

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};
