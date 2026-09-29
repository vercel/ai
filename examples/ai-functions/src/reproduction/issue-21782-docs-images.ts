const affectedImages = [
  {
    integration: 'Langfuse',
    source: 'https://langfuse.com/images/docs/vercel-nested-trace.png',
  },
  {
    integration: 'LangWatch',
    source:
      'https://mintlify.s3.us-west-1.amazonaws.com/langwatch/images/integration/vercel-ai-sdk.png',
  },
  {
    integration: 'Confident AI',
    source:
      'https://confident-docs.s3.us-east-1.amazonaws.com/confident-trace-workflows.png',
  },
  {
    integration: 'Maxim',
    source: 'https://cdn.getmaxim.ai/public/images/maxim_vercel.gif',
  },
] as const;

const widths = [1080, 3840] as const;
const methods = ['GET', 'HEAD'] as const;

async function request(url: string, method: 'GET' | 'HEAD') {
  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(30_000),
  });

  await response.body?.cancel();

  return response;
}

async function main() {
  for (const image of affectedImages) {
    const originResponse = await request(image.source, 'GET');

    if (!originResponse.ok) {
      throw new Error(
        `PRECONDITION FAILED: ${image.integration} source returned HTTP ${originResponse.status}.`,
      );
    }
  }

  const failures: string[] = [];

  for (const image of affectedImages) {
    for (const width of widths) {
      const optimizerUrl = new URL('/_next/image', 'https://ai-sdk.dev');
      optimizerUrl.searchParams.set('url', image.source);
      optimizerUrl.searchParams.set('w', String(width));
      optimizerUrl.searchParams.set('q', '75');

      for (const method of methods) {
        const response = await request(optimizerUrl.toString(), method);
        const contentType = response.headers.get('content-type') ?? '';

        if (response.ok && contentType.startsWith('image/')) {
          continue;
        }

        const vercelError = response.headers.get('x-vercel-error');

        if (
          response.status !== 400 ||
          vercelError !== 'INVALID_IMAGE_OPTIMIZE_REQUEST'
        ) {
          throw new Error(
            `UNEXPECTED RESPONSE: ${image.integration} ${method} w=${width} returned HTTP ${response.status}, content-type ${contentType || '(missing)'}, x-vercel-error ${vercelError || '(missing)'}.`,
          );
        }

        failures.push(
          `${image.integration} ${method} w=${width}: HTTP 400 INVALID_IMAGE_OPTIMIZE_REQUEST`,
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    console.error(
      'ISSUE #21782 REPRODUCED: affected documentation images do not render through /_next/image.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'All affected documentation images render successfully through /_next/image.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
