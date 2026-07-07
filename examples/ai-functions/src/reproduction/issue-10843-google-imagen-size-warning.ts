import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateImage, type Warning } from 'ai';

const fixturePath = fileURLToPath(
  new URL(
    '../../../../packages/google/src/__fixtures__/issue-10843-google-imagen-generate-image.json',
    import.meta.url,
  ),
);

const capturedWarnings: Array<{
  warnings: Warning[];
  provider?: string;
  model?: string;
}> = [];

(
  globalThis as typeof globalThis & {
    AI_SDK_LOG_WARNINGS?: (options: {
      warnings: Warning[];
      provider?: string;
      model?: string;
    }) => void;
  }
).AI_SDK_LOG_WARNINGS = options => {
  capturedWarnings.push(options);
};

function redactImageBytes(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactImageBytes);
  }

  if (value == null || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key === 'bytesBase64Encoded' && typeof entry === 'string') {
        const sha256 = createHash('sha256').update(entry).digest('hex');
        return [
          key,
          `<redacted base64 image bytes; length=${entry.length}; sha256=${sha256}>`,
        ];
      }

      return [key, redactImageBytes(entry)];
    }),
  );
}

async function main() {
  let recordedResponse: unknown;

  const google = createGoogleGenerativeAI({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        try {
          recordedResponse = await response.clone().json();
        } catch {
          recordedResponse = { error: 'Failed to parse JSON response body.' };
        }
      } else {
        recordedResponse = await response.clone().text();
      }

      return response;
    },
  });

  const result = await generateImage({
    model: google.image('imagen-4.0-generate-001'),
    prompt: 'a hamster in a hat',
    aspectRatio: '4:3',
    size: undefined,
    n: 1,
  });

  if (recordedResponse !== undefined) {
    await mkdir(dirname(fixturePath), { recursive: true });
    await writeFile(
      fixturePath,
      `${JSON.stringify(redactImageBytes(recordedResponse), null, 2)}\n`,
    );
  }

  const sizeWarnings = result.warnings.filter(
    warning => warning.type === 'unsupported' && warning.feature === 'size',
  );

  console.log(
    JSON.stringify(
      {
        imageCount: result.images.length,
        resultWarnings: result.warnings,
        capturedWarnings,
        hasUnsupportedSizeWarning: sizeWarnings.length > 0,
        fixturePath,
      },
      null,
      2,
    ),
  );

  if (sizeWarnings.length > 0) {
    throw new Error(
      'Reproduced issue #10843: generateImage returned an unsupported size warning even though size was undefined.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
