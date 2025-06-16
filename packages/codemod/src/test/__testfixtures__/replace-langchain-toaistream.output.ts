// @ts-nocheck
import { LangChainAdapter } from 'ai';
import { model } from 'langchain';

const stream = LangChainAdapter.toDataStream(model.stream(), {
  onToken: token => console.log(token)
});

const response = new Response(stream);
