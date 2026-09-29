import { chromium } from 'playwright';

const V7_INTRODUCTION_URL = 'https://ai-sdk.dev/docs/introduction';
const V6_INTRODUCTION_URL = 'https://ai-sdk.dev/v6/docs/introduction';
const EXPECTED_RESULT_URL =
  'https://ai-sdk.dev/v6/docs/reference/ai-sdk-core/agent';
const REPORTED_RESULT_URL =
  'https://ai-sdk.dev/docs/reference/ai-sdk-core/agent';
const FAILURE_SIGNAL =
  'ISSUE #21781 reproduced: selecting the retained Agent (Interface) search result from v6 navigated to the v7 documentation URL.';

const main = async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      ignoreHTTPSErrors: true,
      viewport: { height: 1000, width: 1440 },
    });
    let searchRequestCount = 0;

    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/search') {
        searchRequestCount++;
      }
    });

    await page.goto(V7_INTRODUCTION_URL, {
      timeout: 90_000,
      waitUntil: 'networkidle',
    });

    await page.getByRole('button', { name: /Search/ }).click();
    const initialSearchResponse = page.waitForResponse(
      response => new URL(response.url()).pathname === '/api/search',
    );
    await page.locator('input[placeholder="Search"]').fill('streamText');

    const initialResults = (await (await initialSearchResponse).json()) as {
      url: string;
    }[];
    await page.getByRole('option').first().waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });

    await page
      .getByRole('button', { name: 'Select documentation version' })
      .click();
    await page.getByRole('menuitem').filter({ hasText: 'v6' }).click();
    await page.waitForURL(V6_INTRODUCTION_URL);

    await page.getByRole('button', { name: /Search/ }).click();
    await page.waitForTimeout(1_500);

    const firstResult = page.getByRole('option').first();
    const firstResultText = (await firstResult.textContent()) ?? '';
    if (!firstResultText.includes('Agent (Interface)')) {
      throw new Error(
        `Unexpected first search result after switching to v6: ${JSON.stringify(firstResultText)}`,
      );
    }

    await firstResult.click();
    await page.waitForURL(/\/docs\/reference\/ai-sdk-core\/agent$/);

    const actualResultUrl = page.url();
    if (actualResultUrl === REPORTED_RESULT_URL) {
      console.error(FAILURE_SIGNAL);
      console.error(
        `Observed ${searchRequestCount} search request(s); the initial v7 response contained ${initialResults.length} results.`,
      );
      process.exitCode = 1;
      return;
    }

    if (actualResultUrl !== EXPECTED_RESULT_URL) {
      throw new Error(
        `Unexpected result URL: ${actualResultUrl}; expected ${EXPECTED_RESULT_URL}`,
      );
    }

    console.log(`Search stayed on v6 and navigated to ${EXPECTED_RESULT_URL}.`);
  } finally {
    await browser.close();
  }
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
