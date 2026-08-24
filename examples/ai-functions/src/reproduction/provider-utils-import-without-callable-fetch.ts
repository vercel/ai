const expectedError =
  "Function.prototype.toString requires that 'this' be a Function";

async function importProviderUtils(fetchValue: unknown, caseName: string) {
  globalThis.fetch = fetchValue as typeof globalThis.fetch;
  const providerUtilsUrl = new URL(
    '../../../../packages/provider-utils/dist/index.mjs',
    import.meta.url,
  );
  providerUtilsUrl.searchParams.set('fetch-case', caseName);

  try {
    await import(providerUtilsUrl.href);
    return false;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes(expectedError)) {
      return true;
    }

    throw error;
  }
}

async function main() {
  const originalFetch = globalThis.fetch;

  try {
    const failingCases = [];

    if (await importProviderUtils(undefined, 'undefined')) {
      failingCases.push('undefined');
    }

    if (await importProviderUtils({}, 'object')) {
      failingCases.push('non-callable object');
    }

    if (failingCases.length > 0) {
      throw new Error(
        `Issue #19421 reproduced: @ai-sdk/provider-utils import throws when globalThis.fetch is not callable (${failingCases.join(', ')})`,
      );
    }

    console.log(
      'Issue #19421 not reproduced: imports accepted both non-callable fetch values',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
