import { chromium, type Page } from 'playwright';

const docsOrigin = 'https://ai-sdk.dev';
const introductionPath = '/docs/introduction';
const viewport = { width: 1440, height: 900 };

type Frame = {
  bodyHeight: number;
  clientWidth: number;
  contentDisplay: string;
  contentHeight: number | null;
  contentOpacity: string;
  contentTextLength: number;
  contentVisibility: string;
  contentWidth: number | null;
  contentX: number | null;
  heading: string;
  linkX: number | null;
  linkWidth: number | null;
  path: string;
  scrollY: number;
  time: number;
};

type MonitorWindow = Window & {
  issue14228Frames?: Frame[];
  issue14228MonitorActive?: boolean;
};

type Scenario = {
  expectedHeading: string;
  startScrollY: number;
  targetPath: string;
};

async function startFrameMonitor(page: Page, targetPath: string) {
  await page.evaluate(`(() => {
    const monitorWindow = window;
    monitorWindow.issue14228Frames = [];
    monitorWindow.issue14228MonitorActive = true;
    const startTime = performance.now();
    const targetPath = ${JSON.stringify(targetPath)};

    const sample = () => {
      const heading = document.querySelector('h1');
      const content = heading?.parentElement;
      const targetLink = document.querySelector(\`a[href="\${targetPath}"]\`);
      const contentStyle = content == null ? null : getComputedStyle(content);
      const contentRect = content?.getBoundingClientRect();
      const linkRect = targetLink?.getBoundingClientRect();

      monitorWindow.issue14228Frames.push({
        bodyHeight: document.body.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        contentDisplay: contentStyle?.display ?? 'missing',
        contentHeight:
          contentRect == null ? null : Math.round(contentRect.height),
        contentOpacity: contentStyle?.opacity ?? 'missing',
        contentTextLength: content?.textContent?.trim().length ?? 0,
        contentVisibility: contentStyle?.visibility ?? 'missing',
        contentWidth: contentRect == null ? null : Math.round(contentRect.width),
        contentX: contentRect == null ? null : Math.round(contentRect.x),
        heading: heading?.textContent?.trim() ?? '',
        linkX: linkRect == null ? null : Math.round(linkRect.x),
        linkWidth: linkRect == null ? null : Math.round(linkRect.width),
        path: location.pathname,
        scrollY: Math.round(scrollY),
        time: Math.round(performance.now() - startTime),
      });

      if (monitorWindow.issue14228MonitorActive) {
        requestAnimationFrame(sample);
      }
    };

    requestAnimationFrame(sample);
  })()`);
}

async function stopFrameMonitor(page: Page) {
  return page.evaluate(() => {
    const monitorWindow = window as MonitorWindow;
    monitorWindow.issue14228MonitorActive = false;
    return monitorWindow.issue14228Frames ?? [];
  });
}

function fail(message: string, frame?: Frame): never {
  const detail = frame == null ? '' : ` Frame: ${JSON.stringify(frame)}`;
  throw new Error(`Reproduced issue #14228: ${message}.${detail}`);
}

async function runScenario(page: Page, scenario: Scenario) {
  await page.goto(`${docsOrigin}${introductionPath}`, {
    timeout: 60_000,
    waitUntil: 'networkidle',
  });
  await page.evaluate(() => document.fonts.ready);

  const targetLink = page.locator(`a[href="${scenario.targetPath}"]`).first();
  await targetLink.scrollIntoViewIfNeeded();
  await page.evaluate(scrollY => scrollTo(0, scrollY), scenario.startScrollY);
  await page.waitForTimeout(100);

  const initial = await page.evaluate(() => ({
    bodyHeight: document.body.scrollHeight,
    scrollY: Math.round(scrollY),
  }));

  await startFrameMonitor(page, scenario.targetPath);
  await targetLink.click({ noWaitAfter: true });
  await page.waitForURL(`**${scenario.targetPath}`, { timeout: 30_000 });
  await page.waitForTimeout(750);

  const frames = await stopFrameMonitor(page);
  const sourceFrames = frames.filter(frame => frame.path === introductionPath);
  const targetFrames = frames.filter(
    frame => frame.path === scenario.targetPath,
  );
  const firstSourceFrame = sourceFrames[0];
  const firstTargetFrame = targetFrames[0];

  if (firstSourceFrame == null) {
    fail('the frame monitor did not observe the source page');
  }

  if (firstTargetFrame == null) {
    fail('the destination page did not render');
  }

  const intermediateFrame = frames.find(
    frame =>
      ![introductionPath, scenario.targetPath].includes(frame.path) ||
      !['AI SDK', scenario.expectedHeading].includes(frame.heading) ||
      frame.contentDisplay === 'none' ||
      frame.contentHeight === 0 ||
      frame.contentOpacity !== '1' ||
      frame.contentTextLength === 0 ||
      frame.contentVisibility !== 'visible' ||
      frame.contentWidth === 0,
  );

  if (intermediateFrame != null) {
    fail(
      'navigation rendered an incomplete or hidden content frame',
      intermediateFrame,
    );
  }

  const mismatchedSourceFrame = sourceFrames.find(
    frame =>
      frame.heading !== 'AI SDK' ||
      frame.bodyHeight !== firstSourceFrame.bodyHeight ||
      frame.contentTextLength !== firstSourceFrame.contentTextLength,
  );

  if (mismatchedSourceFrame != null) {
    fail(
      'the Introduction layout changed before the destination rendered',
      mismatchedSourceFrame,
    );
  }

  const mismatchedTargetFrame = targetFrames.find(
    frame =>
      frame.heading !== scenario.expectedHeading ||
      frame.bodyHeight !== firstTargetFrame.bodyHeight ||
      frame.contentTextLength !== firstTargetFrame.contentTextLength ||
      frame.scrollY !== 0,
  );

  if (mismatchedTargetFrame != null) {
    fail(
      'the destination content, height, and scroll reset were not painted atomically',
      mismatchedTargetFrame,
    );
  }

  const horizontalShiftFrame = targetFrames.find(
    frame =>
      frame.clientWidth !== firstSourceFrame.clientWidth ||
      frame.contentX !== firstSourceFrame.contentX ||
      frame.linkX !== firstSourceFrame.linkX ||
      frame.linkWidth !== firstSourceFrame.linkWidth,
  );

  if (horizontalShiftFrame != null) {
    fail(
      'navigation shifted the page or sidebar horizontally',
      horizontalShiftFrame,
    );
  }

  return {
    destinationBodyHeight: firstTargetFrame.bodyHeight,
    destinationFrames: targetFrames.length,
    destinationScrollY: firstTargetFrame.scrollY,
    initialBodyHeight: initial.bodyHeight,
    initialScrollY: initial.scrollY,
    sourceFrames: sourceFrames.length,
    startScrollY: scenario.startScrollY,
    targetPath: scenario.targetPath,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport,
    });
    const page = await context.newPage();
    const scenarios: Scenario[] = [
      {
        expectedHeading: 'Foundations',
        startScrollY: 0,
        targetPath: '/docs/foundations',
      },
      {
        expectedHeading: 'Foundations',
        startScrollY: 3000,
        targetPath: '/docs/foundations',
      },
      {
        expectedHeading: 'AI SDK Core',
        startScrollY: 0,
        targetPath: '/docs/ai-sdk-core',
      },
      {
        expectedHeading: 'AI SDK Core',
        startScrollY: 3000,
        targetPath: '/docs/ai-sdk-core',
      },
    ];
    const results = [];

    for (const scenario of scenarios) {
      results.push(await runScenario(page, scenario));
    }

    console.log(
      JSON.stringify(
        {
          outcome:
            'Issue #14228 could not be reproduced: every observed navigation frame contained complete content with an atomic scroll reset and stable horizontal geometry.',
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
