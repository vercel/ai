import OpenAI from 'openai';
import {
  OpenAIStream,
  StreamingTextResponse,
  experimental_StreamData,
} from 'ai';
import Speech from 'lmnt-node';

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const speech = new Speech(process.env.LMNT_API_KEY || '');

// IMPORTANT! Set the runtime to edge
// export const runtime = 'edge';

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { prompt } = await req.json();

  // Ask OpenAI for a streaming completion given the prompt
  const response = await openai.completions.create({
    model: 'gpt-3.5-turbo-instruct',
    max_tokens: 2000,
    stream: true,
    prompt,
  });

  const speechStreamingConnection = speech.synthesizeStreaming(
    '034b632b-df71-46c8-b440-86a42ffc3cf3', // Henry
    {},
  );

  const data = new experimental_StreamData();

  // create a promise to wait for the speech stream to finish
  let resolveSpeech: (value: unknown) => void = () => {};
  const speechFinishedPromise = new Promise(resolve => {
    resolveSpeech = resolve;
  });

  // run in parallel:
  (async () => {
    let i = 0;
    for await (const chunk of speechStreamingConnection) {
      try {
        const chunkAny = chunk as any;
        const audioBuffer: Buffer = chunkAny.audio;

        // base64 encode the audio buffer
        const base64Audio = audioBuffer.toString('base64');

        console.log('streaming speech chunk #' + i++);

        data.appendSpeech(base64Audio);
      } catch (err) {
        console.error(err);
      }
    }
    console.log('done streaming speech');

    resolveSpeech?.(undefined);
  })();

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response, {
    onToken(token) {
      speechStreamingConnection.appendText(token);
      speechStreamingConnection.flush();
    },
    async onFinal(completion) {
      speechStreamingConnection.finish();

      await speechFinishedPromise;
      data.close();

      console.log('done streaming text');
    },
    experimental_streamData: true,
  });

  // Respond with the stream
  return new StreamingTextResponse(stream, {}, data);
}
