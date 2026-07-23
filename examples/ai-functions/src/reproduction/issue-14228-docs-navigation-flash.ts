import { chromium, type Page } from 'playwright';

type FrameSample = {
  bodyHeight: number;
  heading: string | null;
  path: string;
  scrollY: number;
  sidebar: { height: number; width: number; x: number; y: number } | null;
};

type NavigationCase = {
  linkName: string;
  scrollY: number;
  targetHeading: string;
  targetPath: string;
};

const baseUrl = 'https://ai-sdk.dev';

async function sampleNavigation(
  page: Page,
  navigationCase: NavigationCase,
): Promise<{
  after: FrameSample;
  before: FrameSample;
  samples: FrameSample[];
}> {
  await page.goto(`${baseUrl}/docs/introduction`, {
    timeout: 120_000,
    waitUntil: 'networkidle',
  });
  await page.evaluate(
    scrollY => window.scrollTo(0, scrollY),
    navigationCase.scrollY,
  );
  await page.waitForTimeout(100);

  const readFrame = () =>
    page.evaluate<FrameSample>(() => {
      const sidebar = document.querySelector('.toc-container');
      const sidebarRect = sidebar?.getBoundingClientRect();

      return {
        bodyHeight: document.body.scrollHeight,
        heading: document.querySelector('h1')?.textContent?.trim() ?? null,
        path: window.location.pathname,
        scrollY: window.scrollY,
        sidebar: sidebarRect
          ? {
              height: sidebarRect.height,
              width: sidebarRect.width,
              x: sidebarRect.x,
              y: sidebarRect.y,
            }
          : null,
      };
    });

  const before = await readFrame();

  await page.evaluate(`
    window.issue14228Samples = [];
    window.issue14228StartedAt = performance.now();
    window.issue14228Sample = () => {
      const sidebar = document.querySelector('.toc-container');
      const sidebarRect = sidebar?.getBoundingClientRect();

      window.issue14228Samples.push({
        bodyHeight: document.body.scrollHeight,
        heading: document.querySelector('h1')?.textContent?.trim() ?? null,
        path: window.location.pathname,
        scrollY: window.scrollY,
        sidebar: sidebarRect
          ? {
              height: sidebarRect.height,
              width: sidebarRect.width,
              x: sidebarRect.x,
              y: sidebarRect.y,
            }
          : null,
      });

      if (performance.now() - window.issue14228StartedAt < 1_500) {
        requestAnimationFrame(window.issue14228Sample);
      }
    };
    requestAnimationFrame(window.issue14228Sample);
  `);

  const sidebar = page.locator('.toc-container');
  await sidebar
    .locator(`a[href="${navigationCase.targetPath}"]`)
    .filter({ hasText: navigationCase.linkName })
    .click();
  await page.waitForURL(`**${navigationCase.targetPath}`, { timeout: 30_000 });
  await page.waitForTimeout(1_600);

  const samples = await page.evaluate(
    () =>
      (window as typeof window & { issue14228Samples?: FrameSample[] })
        .issue14228Samples ?? [],
  );
  const after = await readFrame();

  return { after, before, samples };
}

function detectFlash({
  after,
  before,
  navigationCase,
  samples,
}: {
  after: FrameSample;
  before: FrameSample;
  navigationCase: NavigationCase;
  samples: FrameSample[];
}): string[] {
  const failures: string[] = [];
  const targetFrames = samples.filter(
    sample => sample.path === navigationCase.targetPath,
  );

  if (after.heading !== navigationCase.targetHeading) {
    failures.push(
      `destination heading was ${JSON.stringify(after.heading)}, expected ${JSON.stringify(navigationCase.targetHeading)}`,
    );
  }

  if (
    samples.some(
      sample =>
        sample.heading == null ||
        sample.heading.length === 0 ||
        sample.bodyHeight === 0,
    )
  ) {
    failures.push('a rendered frame had missing page content');
  }

  if (
    targetFrames.some(
      sample =>
        sample.heading !== navigationCase.targetHeading || sample.scrollY !== 0,
    )
  ) {
    failures.push(
      'the destination rendered before its content and scroll position were ready',
    );
  }

  if (
    before.sidebar &&
    after.sidebar &&
    (before.sidebar.x !== after.sidebar.x ||
      before.sidebar.width !== after.sidebar.width ||
      before.sidebar.height !== after.sidebar.height)
  ) {
    failures.push('the persistent documentation sidebar changed geometry');
  }

  return failures;
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { height: 900, width: 1440 },
    });
    const page = await context.newPage();

    const navigationCases: NavigationCase[] = [
      {
        linkName: 'Foundations',
        scrollY: 0,
        targetHeading: 'Foundations',
        targetPath: '/docs/foundations',
      },
      {
        linkName: 'Foundations',
        scrollY: 3_000,
        targetHeading: 'Foundations',
        targetPath: '/docs/foundations',
      },
      {
        linkName: 'AI SDK Core',
        scrollY: 3_000,
        targetHeading: 'AI SDK Core',
        targetPath: '/docs/ai-sdk-core',
      },
    ];

    for (const navigationCase of navigationCases) {
      const result = await sampleNavigation(page, navigationCase);
      const failures = detectFlash({ ...result, navigationCase });

      console.log(
        JSON.stringify({
          bodyHeightAfter: result.after.bodyHeight,
          bodyHeightBefore: result.before.bodyHeight,
          failures,
          linkName: navigationCase.linkName,
          scrollYBefore: result.before.scrollY,
        }),
      );

      if (failures.length > 0) {
        throw new Error(
          `ISSUE_14228_REPRODUCED: transient docs navigation flash detected: ${failures.join('; ')}`,
        );
      }
    }

    console.log(
      'ISSUE_14228_NOT_REPRODUCED: page heights changed with their content, but no blank frame, delayed scroll reset, or persistent sidebar shift was observed.',
    );
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
