import OpenAI from 'openai';
import {
  OpenAIStream,
  StreamingTextResponse,
  experimental_StreamData,
  forwardLmntSpeechStream,
} from 'ai';
import Speech from 'lmnt-node';

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Create an LMNT API client
const speech = new Speech(process.env.LMNT_API_KEY || 'no key');

// Note: The LMNT SDK does not work on edge (v1.1.2)
// export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Ask OpenAI for a streaming chat completion given the prompt
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages,
  });

  const speechStream = speech.synthesizeStreaming(
    '034b632b-df71-46c8-b440-86a42ffc3cf3', // Henry
    {},
  );

  const data = new experimental_StreamData();

  // note: no await here, we want to run this in parallel:
  forwardLmntSpeechStream(speechStream, data, {
    onFinal() {
      data.close();
    },
  });

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response, {
    onToken(token) {
      speechStream.appendText(token);

      // only flush after each sentence to make it sound more natural:
      if (token.includes('.')) {
        speechStream.flush();
      }
    },
    onFinal(completion) {
      speechStream.finish(); // flush any remaining tokens and close the stream
    },
    experimental_streamData: true,
  });

  // Respond with the stream
  return new StreamingTextResponse(stream, {}, data);
}
