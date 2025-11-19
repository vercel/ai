import { azure } from '@ai-sdk/azure';
import { convertToModelMessages, InferUITools, streamText, ToolSet, UIDataTypes, UIMessage } from 'ai';


const tools = {
  web_search_preview: azure.tools.webSearchPreview({searchContextSize:"medium"}),
} satisfies ToolSet;

export type AzureWebSearchPreviewMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;


export async function POST(req: Request) {
  try{
    const { messages }: { messages: AzureWebSearchPreviewMessage[] } = await req.json();
  
    const prompt = convertToModelMessages(messages);
  
    const result = streamText({
      model: azure.responses('gpt-4.1-mini'),
      prompt,
      tools:{
        web_search_preview: azure.tools.webSearchPreview({}),
      }
    });
  
    // for await(const part of result.fullStream){
    //   console.log(JSON.stringify(part).substring(0,400))
    // }
  
    return result.toUIMessageStreamResponse();

  }catch(e){

  }
}
