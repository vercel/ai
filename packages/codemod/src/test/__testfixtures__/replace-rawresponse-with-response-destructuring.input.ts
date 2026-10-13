// @ts-nocheck

async function generate() {
  const response = 'existing';
  const { rawResponse: headers } = await generateText({});
  const { rawResponse } = await embed({});
  const {
    response: currentResponse,
    rawResponse: previousResponse,
  } = await generateObject({});

  return [response, headers, rawResponse, currentResponse, previousResponse];
}

function stream() {
  const response = 'existing';
  const { rawResponse: headers } = streamText({});
  const { rawResponse } = streamObject({});

  return [response, headers, rawResponse];
}
