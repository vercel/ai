// @ts-nocheck
import { toAIStream } from 'ai/streams';
import { model } from 'langchain';

const stream = toAIStream(model.stream(), {
  onToken: token => console.log(token)
});

const response = new Response(stream);
