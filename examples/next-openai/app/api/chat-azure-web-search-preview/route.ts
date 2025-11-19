import { azure } from '@ai-sdk/azure';
import {
  convertToModelMessages,
  InferUITools,
  streamText,
  ToolSet,
  UIDataTypes,
  UIMessage,
} from 'ai';

const tools = {
  web_search_preview: azure.tools.webSearchPreview({}),
} satisfies ToolSet;

export type AzureWebSearchPreviewMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages }: { messages: AzureWebSearchPreviewMessage[] } =
    await req.json();

  const prompt = convertToModelMessages(messages);

  const result = streamText({
    model: azure.responses('gpt-4.1-mini'),
    prompt,
    tools: {
      web_search_preview: azure.tools.webSearchPreview({
        userLocation: {
          type: 'approximate',
          country: 'JP',
          city: '東京',
          region: '関東',
        },
        searchContextSize: 'low',
      }),
    },
    onChunk: ({ chunk }) => {
      console.log('Chunk:', chunk);
    },
    onError: error => {
      console.error('error:', error);
    },
  });

  console.log('test3');

  // for await(const part of result.fullStream){
  //   if(part.type==="error"){
  //     console.error(part.error)
  //   }else{
  //     console.log(JSON.stringify(part).substring(0,400))
  //   }
  // }

  return result.toUIMessageStreamResponse();
}
