import {
  OpenAIStream,
  StreamingTextResponse,
  experimental_StreamData,
  forwardModelFusionSpeechStream,
} from 'ai';
import { AsyncQueue, elevenlabs, streamSpeech } from 'modelfusion';
import OpenAI from 'openai';

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const elevenLabsSpeech = elevenlabs.SpeechGenerator({
  voice: '21m00Tcm4TlvDq8ikWAM', // Rachel
  optimizeStreamingLatency: 1,
  voiceSettings: {
    stability: 1,
    similarityBoost: 0.35,
  },
});

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

  const speechTextQueue = new AsyncQueue<string>();

  const speechStream = await streamSpeech({
    model: elevenLabsSpeech,
    text: speechTextQueue,
  });

  const data = new experimental_StreamData();

  // note: no await here, we want to run this in parallel:
  forwardModelFusionSpeechStream(speechStream, data, {
    onFinal() {
      data.close();
    },
  });

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response, {
    onToken(token) {
      speechTextQueue.push(token);
    },
    onFinal(completion) {
      speechTextQueue.close();
    },
    experimental_streamData: true,
  });

  // Respond with the stream
  return new StreamingTextResponse(stream, {}, data);
}
