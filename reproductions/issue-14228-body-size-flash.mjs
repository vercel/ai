#!/usr/bin/env node
/**
 * Reproduction for vercel/ai issue #14228.
 *
 * The report says that clicking the "Foundations" menu item on
 * https://ai-sdk.dev/docs/introduction changes the page body size and causes a
 * visible flash. This script exercises that exact live-docs flow with
 * Playwright and fails when the document/body dimensions change substantially
 * after the click.
 *
 * Usage:
 *   pnpm exec node reproductions/issue-14228-body-size-flash.mjs
 */

import { chromium } from 'playwright';

const startUrl = 'https://ai-sdk.dev/docs/introduction';
const targetPath = '/docs/foundations';
const viewport = { width: 1280, height: 900 };
const allowedBodyHeightDeltaPx = 100;

function getMetricsScript() {
  const root = document.documentElement;
  const body = document.body;
  const article = document.querySelector('article')?.getBoundingClientRect();
  const leftNav = document
    .querySelector('.toc-container')
    ?.getBoundingClientRect();

  return {
    path: location.pathname,
    innerWidth,
    innerHeight,
    bodyClientWidth: body.clientWidth,
    bodyOffsetWidth: body.offsetWidth,
    bodyScrollHeight: body.scrollHeight,
    htmlClientWidth: root.clientWidth,
    htmlScrollHeight: root.scrollHeight,
    article: article
      ? {
          x: article.x,
          y: article.y,
          width: article.width,
          height: article.height,
        }
      : null,
    leftNav: leftNav
      ? {
          x: leftNav.x,
          y: leftNav.y,
          width: leftNav.width,
          height: leftNav.height,
        }
      : null,
  };
}

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport });

  await page.goto(startUrl, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });

  const before = await page.evaluate(getMetricsScript);

  const foundationsLink = page.locator(`a[href="${targetPath}"]`).first();
  await foundationsLink.waitFor({ state: 'visible', timeout: 30_000 });
  await foundationsLink.click();
  await page.waitForURL(`**${targetPath}`, { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
    // The docs page may keep analytics/beacon requests open; the URL and DOM
    // metrics below are sufficient for this reproduction.
  });
  await page.waitForTimeout(250);

  const after = await page.evaluate(getMetricsScript);
  const bodyHeightDelta = Math.abs(
    after.bodyScrollHeight - before.bodyScrollHeight,
  );
  const articleHeightDelta =
    before.article && after.article
      ? Math.abs(after.article.height - before.article.height)
      : null;

  console.log(
    JSON.stringify(
      {
        scenario:
          'Click the "Foundations" menu item from the AI SDK docs introduction page.',
        before,
        after,
        deltas: {
          bodyScrollHeight: bodyHeightDelta,
          articleHeight: articleHeightDelta,
        },
        assertion: `body scroll height should not change by more than ${allowedBodyHeightDeltaPx}px during this menu click`,
      },
      null,
      2,
    ),
  );

  if (bodyHeightDelta > allowedBodyHeightDeltaPx) {
    throw new Error(
      `Reproduced issue #14228: clicking "Foundations" changed body scroll height by ${bodyHeightDelta}px (${before.bodyScrollHeight}px -> ${after.bodyScrollHeight}px), which is large enough to produce the reported page-size flash.`,
    );
  }
} finally {
  await browser.close();
}
