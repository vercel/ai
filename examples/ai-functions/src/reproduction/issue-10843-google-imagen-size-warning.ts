import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { experimental_generateImage as generateImage } from 'ai';

const fixturePath = fileURLToPath(
  new URL(
    '../../../../packages/google/src/__fixtures__/issue-10843-google-imagen-generate-image.json',
    import.meta.url,
  ),
);

function redactImageBytes(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactImageBytes);
  }

  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        key === 'bytesBase64Encoded' && typeof nestedValue === 'string'
          ? `<redacted ${nestedValue.length} chars>`
          : redactImageBytes(nestedValue),
      ]),
    );
  }

  return value;
}

async function main() {
  const capturedWarnings: string[] = [];
  const originalWarn = console.warn;

  const google = createGoogleGenerativeAI({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      const responseText = await response.clone().text();
      const responseBody = JSON.parse(responseText);

      await mkdir(dirname(fixturePath), { recursive: true });
      await writeFile(
        fixturePath,
        `${JSON.stringify(
          {
            request: {
              url: input instanceof URL ? input.toString() : String(input),
              method: init?.method ?? 'GET',
              body:
                typeof init?.body === 'string'
                  ? JSON.parse(init.body)
                  : undefined,
            },
            response: {
              status: response.status,
              body: redactImageBytes(responseBody),
            },
          },
          null,
          2,
        )}\n`,
      );

      return response;
    },
  });

  console.warn = (...args) => {
    capturedWarnings.push(args.map(String).join(' '));
    originalWarn(...args);
  };

  try {
    const result = await generateImage({
      model: google.image('imagen-4.0-generate-001'),
      prompt: 'a hamster in a hat',
      aspectRatio: '4:3',
      size: undefined,
      n: 1,
      providerOptions: {
        google: {
          numberOfImages: 1,
        },
      },
    });

    const unsupportedSizeWarning = 'The feature "size" is not supported.';
    const hasUnsupportedSizeWarning =
      result.warnings.some(
        warning => warning.type === 'unsupported' && warning.feature === 'size',
      ) ||
      capturedWarnings.some(warning =>
        warning.includes(unsupportedSizeWarning),
      );

    console.log(
      JSON.stringify(
        {
          imageCount: result.images.length,
          resultWarnings: result.warnings,
          capturedWarnings,
          hasUnsupportedSizeWarning,
          fixturePath,
        },
        null,
        2,
      ),
    );
  } finally {
    console.warn = originalWarn;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
