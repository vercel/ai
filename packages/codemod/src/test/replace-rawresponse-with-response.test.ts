import { defineInlineTest } from 'jscodeshift/src/testUtils';
import transform from '../codemods/replace-rawresponse-with-response';

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { generateText } from 'ai';

export async function testBasic() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Hello world',
  });
  
  console.log(result.rawResponse.headers);
  return result.rawResponse.body;
}
`,
  `
import { generateText } from 'ai';

export async function testBasic() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Hello world',
  });
  
  console.log(result.response.headers);
  return result.response.body;
}
`,
  'should transform rawResponse to response for generateText',
);

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { generateText } from 'ai';

export async function testDestructuring() {
  const { text, rawResponse } = await generateText({
    model: 'some-model', 
    prompt: 'Hello world',
  });
  
  console.log(rawResponse.headers);
  return rawResponse.body;
}
`,
  `
import { generateText } from 'ai';

export async function testDestructuring() {
  const { text, response } = await generateText({
    model: 'some-model', 
    prompt: 'Hello world',
  });
  
  console.log(response.headers);
  return response.body;
}
`,
  'should transform destructured rawResponse to response',
);

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { generateObject, streamText } from 'ai';

export async function testMultiple() {
  const objectResult = await generateObject({
    model: 'some-model',
    prompt: 'Generate object',
    schema: { type: 'object' },
  });
  
  const streamResult = streamText({
    model: 'some-model',
    prompt: 'Stream text',
  });
  
  return {
    objectStatus: objectResult.rawResponse.status,
    streamHeaders: streamResult.rawResponse?.headers,
  };
}
`,
  `
import { generateObject, streamText } from 'ai';

export async function testMultiple() {
  const objectResult = await generateObject({
    model: 'some-model',
    prompt: 'Generate object',
    schema: { type: 'object' },
  });
  
  const streamResult = streamText({
    model: 'some-model',
    prompt: 'Stream text',
  });
  
  return {
    objectStatus: objectResult.response.status,
    streamHeaders: streamResult.response?.headers,
  };
}
`,
  'should transform rawResponse for multiple AI methods',
);

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { embed } from 'ai';

export async function testAssignment() {
  let result;
  result = await embed({
    model: 'some-model',
    value: 'Some text',
  });
  
  return result.rawResponse;
}
`,
  `
import { embed } from 'ai';

export async function testAssignment() {
  let result;
  result = await embed({
    model: 'some-model',
    value: 'Some text',
  });
  
  return result.response;
}
`,
  'should transform rawResponse for assignment expressions',
);
