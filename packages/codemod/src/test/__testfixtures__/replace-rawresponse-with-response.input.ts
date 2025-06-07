// @ts-nocheck
import { generateText, generateObject, streamText, streamObject, embed, embedMany } from 'ai';

// Basic variable assignment
export async function testBasicAssignment() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Hello world',
  });
  
  console.log(result.rawResponse.headers);
  return result.rawResponse.body;
}

// Destructuring in variable declaration
export async function testDestructuring() {
  const { text, rawResponse } = await generateText({
    model: 'some-model', 
    prompt: 'Hello world',
  });
  
  console.log(rawResponse.headers);
  return { text, response: rawResponse };
}

// Destructuring both response and rawResponse
export async function testBothResponseTypes() {
  const { text, response, rawResponse } = await generateText({
    model: 'some-model',
    prompt: 'Hello world',
  });
  
  console.log(rawResponse.headers);
  console.log(response.modelId);
  return { text, oldResponse: rawResponse, newResponse: response };
}

// Multiple AI methods
export async function testMultipleMethods() {
  const textResult = await generateText({
    model: 'some-model',
    prompt: 'Generate text',
  });
  
  const objectResult = await generateObject({
    model: 'some-model',
    prompt: 'Generate object',
    schema: { type: 'object' },
  });
  
  const embedResult = await embed({
    model: 'some-model',
    value: 'Some text',
  });
  
  return {
    textHeaders: textResult.rawResponse.headers,
    objectStatus: objectResult.rawResponse.status,
    embedBody: embedResult.rawResponse?.body,
  };
}

// Streaming methods
export async function testStreamingMethods() {
  const streamTextResult = streamText({
    model: 'some-model',
    prompt: 'Stream text',
  });
  
  const streamObjectResult = streamObject({
    model: 'some-model', 
    prompt: 'Stream object',
    schema: { type: 'object' },
  });
  
  // Access after await
  const finalStreamText = await streamTextResult;
  const finalStreamObject = await streamObjectResult;
  
  return {
    streamTextResponse: finalStreamText.rawResponse,
    streamObjectHeaders: finalStreamObject.rawResponse.headers,
  };
}

// Chained access
export async function testChainedAccess() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Hello',
  });
  
  const headers = result.rawResponse?.headers;
  const contentType = result.rawResponse.headers['content-type'];
  
  return { headers, contentType };
}

// Assignment expression
export async function testAssignmentExpression() {
  let result;
  result = await generateText({
    model: 'some-model',
    prompt: 'Hello',
  });
  
  return result.rawResponse;
}

// EmbedMany method
export async function testEmbedMany() {
  const { embeddings, rawResponse } = await embedMany({
    model: 'some-model',
    values: ['text1', 'text2'],
  });
  
  return {
    embeddings,
    headers: rawResponse.headers,
  };
} 