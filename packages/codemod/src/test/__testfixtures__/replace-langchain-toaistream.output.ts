// @ts-nocheck
import { toDataStream } from 'ai/streams';
import { model } from 'langchain';

const stream = toDataStream(model.stream(), {
  onToken: token => console.log(token)
});

const response = new Response(stream);
