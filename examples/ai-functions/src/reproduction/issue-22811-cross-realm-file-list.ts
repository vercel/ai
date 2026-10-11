import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

type ConversionResult =
  | {
      success: true;
      parts: Array<{
        type: string;
        mediaType: string;
        filename: string;
        url: string;
      }>;
    }
  | {
      success: false;
      name: string;
      message: string;
    };

async function main() {
  const requireFromAiPackage = createRequire(
    new URL('../../../../packages/ai/package.json', import.meta.url),
  );
  const { build } = requireFromAiPackage('esbuild') as {
    build(options: unknown): Promise<{
      outputFiles: Array<{ text: string }>;
    }>;
  };

  const aiEntry = resolve(process.cwd(), '../../packages/ai/dist/index.js');
  const bundled = await build({
    stdin: {
      contents: `export { convertFileListToFileUIParts } from ${JSON.stringify(aiEntry)};`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'SDK',
    platform: 'browser',
  });

  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium',
  });

  try {
    const page = await browser.newPage();
    await page.setContent('<iframe></iframe>');
    await page.addScriptTag({ content: bundled.outputFiles[0].text });

    const result = (await page.evaluate(`(async () => {
      async function convert(scope) {
        const transfer = new scope.DataTransfer();
        transfer.items.add(
          new scope.File(['hello'], 'hello.txt', { type: 'text/plain' })
        );

        try {
          return {
            success: true,
            parts: await SDK.convertFileListToFileUIParts(transfer.files),
          };
        } catch (error) {
          return {
            success: false,
            name: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }

      const iframe = document.querySelector('iframe');
      if (iframe == null || iframe.contentWindow == null) {
        throw new Error('same-origin iframe did not expose contentWindow');
      }

      return {
        sameRealm: await convert(window),
        iframeRealm: await convert(iframe.contentWindow),
      };
    })()`)) as {
      sameRealm: ConversionResult;
      iframeRealm: ConversionResult;
    };

    const expectedPart = {
      type: 'file',
      mediaType: 'text/plain',
      filename: 'hello.txt',
      url: 'data:text/plain;base64,aGVsbG8=',
    };

    if (!result.sameRealm.success) {
      throw new Error(
        `same-realm control failed: ${result.sameRealm.name}: ${result.sameRealm.message}`,
      );
    }
    if (
      result.sameRealm.parts.length !== 1 ||
      JSON.stringify(result.sameRealm.parts[0]) !== JSON.stringify(expectedPart)
    ) {
      throw new Error(
        `same-realm control returned an unexpected part: ${JSON.stringify(result.sameRealm.parts)}`,
      );
    }

    if (!result.iframeRealm.success) {
      throw new Error(
        `ISSUE_22811: same-origin iframe FileList conversion failed: ${result.iframeRealm.name}: ${result.iframeRealm.message}`,
      );
    }
    if (
      result.iframeRealm.parts.length !== 1 ||
      JSON.stringify(result.iframeRealm.parts[0]) !==
        JSON.stringify(expectedPart)
    ) {
      throw new Error(
        `ISSUE_22811: same-origin iframe FileList conversion returned an unexpected part: ${JSON.stringify(result.iframeRealm.parts)}`,
      );
    }

    console.log('same-realm and same-origin iframe FileLists both converted');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
