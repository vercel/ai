// @ts-nocheck

async function generate() {
  const response = 'existing';
  const { response: headers } = await generateText({});
  const { response: rawResponse } = await embed({});
  const {
    response: currentResponse,
    response: previousResponse,
  } = await generateObject({});

  return [response, headers, rawResponse, currentResponse, previousResponse];
}

function stream() {
  const response = 'existing';
  const { response: headers } = streamText({});
  const { response: rawResponse } = streamObject({});

  return [response, headers, rawResponse];
}
