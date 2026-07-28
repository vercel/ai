import { createXai } from '@ai-sdk/xai';
import { generateText, streamText } from 'ai';

const settings = {
  prompt: 'Reply with exactly: hello',
  maxOutputTokens: 16,
  topK: 10,
  presencePenalty: 0.5,
  frequencyPenalty: 0.5,
} as const;

type RecordedCall = {
  url: string;
  requestBody: Record<string, unknown>;
};

async function main() {
  const calls: RecordedCall[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const response = await fetch(input, init);

    calls.push({
      url,
      requestBody: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
    });

    return response;
  };

  const xai = createXai({ fetch: recordingFetch });
  const responsesModel = xai.responses('grok-4');

  const generated = await generateText({
    model: responsesModel,
    ...settings,
  });

  const streamed = streamText({
    model: responsesModel,
    ...settings,
  });
  await streamed.text;
  const streamWarnings = await streamed.warnings;

  const chat = await generateText({
    model: xai.chat('grok-4'),
    ...settings,
  });

  const responsesCalls = calls.filter(call => call.url.endsWith('/responses'));

  const warningSettings = (warnings: typeof generated.warnings) =>
    warnings?.map(warning =>
      warning.type === 'unsupported-setting' ? warning.setting : warning.type,
    ) ?? [];
  const generateWarningSettings = warningSettings(generated.warnings);
  const streamWarningSettings = warningSettings(streamWarnings);
  const chatWarningSettings = warningSettings(chat.warnings);
  const unsupportedSettings = ['topK', 'presencePenalty', 'frequencyPenalty'];
  const requestFields = ['top_k', 'presence_penalty', 'frequency_penalty'];

  const missingGenerateWarnings = unsupportedSettings.filter(
    setting => !generateWarningSettings.includes(setting),
  );
  const missingStreamWarnings = unsupportedSettings.filter(
    setting => !streamWarningSettings.includes(setting),
  );
  const omittedRequestFields = requestFields.filter(field =>
    responsesCalls.every(call => !(field in call.requestBody)),
  );

  console.log(
    JSON.stringify(
      {
        responsesGenerateWarnings: generated.warnings,
        responsesStreamWarnings: streamWarnings,
        chatWarnings: chat.warnings,
        responsesRequestBodies: responsesCalls.map(call => call.requestBody),
      },
      null,
      2,
    ),
  );

  if (
    missingGenerateWarnings.length === 3 &&
    missingStreamWarnings.length === 3 &&
    omittedRequestFields.length === 3 &&
    unsupportedSettings.every(setting => chatWarningSettings.includes(setting))
  ) {
    throw new Error(
      'ISSUE_17936_REPRODUCED: xai.responses generateText and streamText silently dropped topK, presencePenalty, and frequencyPenalty without warnings',
    );
  }

  console.log('Issue #17936 was not reproduced.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
