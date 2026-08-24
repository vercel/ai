import {
  createDeepSeek,
  type DeepSeekLanguageModelChatOptions,
} from '@ai-sdk/deepseek';
import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const failureSignal =
  'ISSUE #19382 REPRODUCED: DeepSeek sampling options are silently forwarded without actionable warnings';

const prompt: LanguageModelV4CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] },
];

const samplingOptions = {
  temperature: 0.2,
  topP: 0.4,
  frequencyPenalty: 0.5,
  presencePenalty: 0.5,
};

function hasDeprecatedWarning(
  warnings: SharedV4Warning[],
  setting: string,
): boolean {
  return warnings.some(
    warning =>
      warning.type === 'deprecated' &&
      warning.setting.toLowerCase().includes(setting.toLowerCase()),
  );
}

function hasUnsupportedWarning(
  warnings: SharedV4Warning[],
  feature: string,
): boolean {
  return warnings.some(
    warning =>
      warning.type === 'unsupported' &&
      warning.feature.toLowerCase() === feature.toLowerCase(),
  );
}

function checkDeprecatedOptions({
  body,
  warnings,
  label,
  failures,
}: {
  body: Record<string, unknown>;
  warnings: SharedV4Warning[];
  label: string;
  failures: string[];
}) {
  if ('frequency_penalty' in body) {
    failures.push(`${label} forwarded deprecated frequency_penalty`);
  }
  if ('presence_penalty' in body) {
    failures.push(`${label} forwarded deprecated presence_penalty`);
  }
  if (!hasDeprecatedWarning(warnings, 'frequencyPenalty')) {
    failures.push(`${label} omitted the frequencyPenalty deprecation warning`);
  }
  if (!hasDeprecatedWarning(warnings, 'presencePenalty')) {
    failures.push(`${label} omitted the presencePenalty deprecation warning`);
  }
}

function checkDefaultThinkingOptions({
  body,
  warnings,
  label,
  failures,
}: {
  body: Record<string, unknown>;
  warnings: SharedV4Warning[];
  label: string;
  failures: string[];
}) {
  if ('temperature' in body) {
    failures.push(`${label} forwarded no-op temperature in default thinking`);
  }
  if ('top_p' in body) {
    failures.push(`${label} forwarded no-op top_p in default thinking`);
  }
  if (!hasUnsupportedWarning(warnings, 'temperature')) {
    failures.push(`${label} omitted the default-thinking temperature warning`);
  }
  if (!hasUnsupportedWarning(warnings, 'topP')) {
    failures.push(`${label} omitted the default-thinking topP warning`);
  }
}

function checkDisabledThinkingOptions({
  body,
  warnings,
  label,
  failures,
}: {
  body: Record<string, unknown>;
  warnings: SharedV4Warning[];
  label: string;
  failures: string[];
}) {
  if (body.temperature !== 0.2) {
    failures.push(
      `${label} did not preserve temperature with thinking disabled`,
    );
  }
  if (body.top_p !== 0.4) {
    failures.push(`${label} did not preserve topP with thinking disabled`);
  }
  if (hasUnsupportedWarning(warnings, 'temperature')) {
    failures.push(`${label} warned that supported temperature was unsupported`);
  }
  if (hasUnsupportedWarning(warnings, 'topP')) {
    failures.push(`${label} warned that supported topP was unsupported`);
  }
}

async function main() {
  const fixtureDirectory = resolve(
    process.cwd(),
    '../../packages/deepseek/src/chat/__fixtures__',
  );
  const generateFixture = await readFile(
    resolve(fixtureDirectory, 'deepseek-v4-sampling-live.json'),
    'utf8',
  );
  const streamFixture = `${(
    await readFile(
      resolve(fixtureDirectory, 'deepseek-v4-sampling-live.chunks.txt'),
      'utf8',
    )
  )
    .trim()
    .split('\n')
    .map(line => `data: ${line}\n\n`)
    .join('')}data: [DONE]\n\n`;

  const requestBodies: Record<string, unknown>[] = [];
  const provider = createDeepSeek({
    apiKey: 'reproduction-api-key',
    fetch: async (_input, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected a JSON string request body');
      }
      const body = JSON.parse(init.body) as Record<string, unknown>;
      requestBodies.push(body);

      return body.stream === true
        ? new Response(streamFixture, {
            headers: { 'content-type': 'text/event-stream' },
          })
        : new Response(generateFixture, {
            headers: { 'content-type': 'application/json' },
          });
    },
  });
  const model = provider.chat('deepseek-v4-flash');
  const failures: string[] = [];

  const defaultGenerate = await model.doGenerate({
    prompt,
    ...samplingOptions,
  });
  const defaultGenerateBody = requestBodies.shift();
  if (defaultGenerateBody == null) {
    throw new Error('Default-thinking generate request was not captured');
  }
  checkDeprecatedOptions({
    body: defaultGenerateBody,
    warnings: defaultGenerate.warnings,
    label: 'generate/default-thinking',
    failures,
  });
  checkDefaultThinkingOptions({
    body: defaultGenerateBody,
    warnings: defaultGenerate.warnings,
    label: 'generate/default-thinking',
    failures,
  });

  const defaultStream = await model.doStream({
    prompt,
    ...samplingOptions,
  });
  const defaultStreamParts = await convertReadableStreamToArray(
    defaultStream.stream,
  );
  const defaultStreamStart = defaultStreamParts.find(
    part => part.type === 'stream-start',
  );
  const defaultStreamBody = requestBodies.shift();
  if (
    defaultStreamBody == null ||
    defaultStreamStart?.type !== 'stream-start'
  ) {
    throw new Error('Default-thinking stream request did not complete');
  }
  checkDeprecatedOptions({
    body: defaultStreamBody,
    warnings: defaultStreamStart.warnings,
    label: 'stream/default-thinking',
    failures,
  });
  checkDefaultThinkingOptions({
    body: defaultStreamBody,
    warnings: defaultStreamStart.warnings,
    label: 'stream/default-thinking',
    failures,
  });

  const disabledThinkingProviderOptions = {
    deepseek: {
      thinking: { type: 'disabled' },
    } satisfies DeepSeekLanguageModelChatOptions,
  };
  const disabledGenerate = await model.doGenerate({
    prompt,
    ...samplingOptions,
    providerOptions: disabledThinkingProviderOptions,
  });
  const disabledGenerateBody = requestBodies.shift();
  if (disabledGenerateBody == null) {
    throw new Error('Disabled-thinking generate request was not captured');
  }
  checkDeprecatedOptions({
    body: disabledGenerateBody,
    warnings: disabledGenerate.warnings,
    label: 'generate/disabled-thinking',
    failures,
  });
  checkDisabledThinkingOptions({
    body: disabledGenerateBody,
    warnings: disabledGenerate.warnings,
    label: 'generate/disabled-thinking',
    failures,
  });

  const disabledStream = await model.doStream({
    prompt,
    ...samplingOptions,
    providerOptions: disabledThinkingProviderOptions,
  });
  const disabledStreamParts = await convertReadableStreamToArray(
    disabledStream.stream,
  );
  const disabledStreamStart = disabledStreamParts.find(
    part => part.type === 'stream-start',
  );
  const disabledStreamBody = requestBodies.shift();
  if (
    disabledStreamBody == null ||
    disabledStreamStart?.type !== 'stream-start'
  ) {
    throw new Error('Disabled-thinking stream request did not complete');
  }
  checkDeprecatedOptions({
    body: disabledStreamBody,
    warnings: disabledStreamStart.warnings,
    label: 'stream/disabled-thinking',
    failures,
  });
  checkDisabledThinkingOptions({
    body: disabledStreamBody,
    warnings: disabledStreamStart.warnings,
    label: 'stream/disabled-thinking',
    failures,
  });

  if (failures.length > 0) {
    console.error(failureSignal);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #19382 is fixed: request fields and warnings match DeepSeek thinking-mode support.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
