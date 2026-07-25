import { expect, test, type Locator, type Page } from '@playwright/test';

const runs = [
  {
    id: 'generate-run',
    started_at: '2026-07-22T08:00:00.000Z',
    stepCount: 1,
    firstMessage: 'Generate a concise status update',
    hasError: false,
    isInProgress: false,
    type: 'generate',
    function_id: 'generateText',
  },
  {
    id: 'stream-run',
    started_at: '2026-07-22T08:01:00.000Z',
    stepCount: 1,
    firstMessage: 'Stream a concise status update',
    hasError: false,
    isInProgress: false,
    type: 'stream',
    function_id: 'streamText',
  },
];

const selectedRun = {
  run: {
    id: 'generate-run',
    started_at: '2026-07-22T08:00:00.000Z',
    isInProgress: false,
    function_id: 'generateText',
  },
  steps: [
    {
      id: 'generate-step',
      run_id: 'generate-run',
      step_number: 1,
      type: 'generate',
      model_id: 'openai/gpt-4.1',
      provider: 'gateway',
      started_at: '2026-07-22T08:00:00.000Z',
      duration_ms: 1200,
      input: JSON.stringify({
        prompt: [
          {
            role: 'user',
            content: 'Inspect representative selected-run content.',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'lookupWeather',
                toolCallId: 'weather-call',
                input: { city: 'Portland' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolName: 'lookupWeather',
                toolCallId: 'weather-call',
                output: { temperature: 72 },
              },
            ],
          },
        ],
      }),
      output: JSON.stringify({
        content: [
          {
            type: 'tool-call',
            toolName: 'lookupWeather',
            toolCallId: 'weather-call',
            input: { city: 'Portland' },
          },
          {
            type: 'tool-result',
            toolName: 'lookupWeather',
            toolCallId: 'weather-call',
            output: { temperature: 72 },
          },
          {
            type: 'text',
            text: 'Representative timeline response.',
          },
        ],
      }),
      usage: JSON.stringify({
        inputTokens: 42,
        outputTokens: 17,
      }),
      error: 'Representative provider error.',
      raw_request: null,
      raw_response: null,
      raw_chunks: null,
      provider_options: null,
    },
  ],
  childRuns: [],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/runs', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(runs),
    }),
  );
  await page.route('**/api/runs/generate-run', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(selectedRun),
    }),
  );
  await page.route('**/api/events', route =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: 'event: connected\ndata: {}\n\n',
    }),
  );

  await page.goto('/');
  await expect(page.getByText('generate', { exact: true })).toBeVisible();
});

test('theme status text and keyboard focus meet contrast targets', async ({
  page,
}) => {
  const themeToggle = page.getByRole('button', { name: 'Use light theme' });
  const generateBadge = page.getByText('generate', { exact: true });
  const streamBadge = page.getByText('stream', { exact: true });

  await assertThemeContrast({
    page,
    theme: 'dark',
    themeToggle,
    statusBadges: [generateBadge, streamBadge],
  });

  await themeToggle.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await assertThemeContrast({
    page,
    theme: 'light',
    themeToggle,
    statusBadges: [generateBadge, streamBadge],
  });

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('selected-run content and timeline metadata meet contrast targets', async ({
  page,
}) => {
  await page
    .getByRole('button', {
      name: /Generate a concise status update/,
    })
    .click();

  const selectedRunMessage = page
    .getByText('Inspect representative selected-run content.', {
      exact: true,
    })
    .first();
  await expect(selectedRunMessage).toBeVisible();

  await page
    .locator('main')
    .getByRole('button', {
      name: /Inspect representative selecte/,
    })
    .click();

  const toolCall = page.getByText('lookupWeather({ city: "Portland" })', {
    exact: true,
  });
  const toolResult = page.getByText('lookupWeather(…) => { temperature: 72 }', {
    exact: true,
  });
  const error = page.getByText('Representative provider error.', {
    exact: true,
  });

  await assertTextContrast([selectedRunMessage, toolCall, toolResult, error]);

  await page.getByRole('button', { name: 'Timeline' }).click();

  const timeLabel = page.getByText('240ms', { exact: true });
  const tokenCount = page.getByText('42→17', { exact: true });
  await assertTextContrast([timeLabel, tokenCount]);

  await page.getByRole('button', { name: 'Use light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await assertTextContrast([timeLabel, tokenCount]);

  await page.getByRole('button', { name: 'Timeline' }).click();
  await assertTextContrast([selectedRunMessage, toolCall, toolResult, error]);
});

async function assertThemeContrast({
  page,
  theme,
  themeToggle,
  statusBadges,
}: {
  page: Page;
  theme: 'dark' | 'light';
  themeToggle: Locator;
  statusBadges: Locator[];
}) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

  for (const badge of statusBadges) {
    expect(await textContrastRatio(badge)).toBeGreaterThanOrEqual(4.5);
  }

  if (
    !(await themeToggle.evaluate(element => element === document.activeElement))
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(themeToggle).toBeFocused();
  await page.waitForTimeout(300);
  expect(await focusRingContrastRatio(themeToggle)).toBeGreaterThanOrEqual(3);
}

async function assertTextContrast(locators: Locator[]) {
  for (const locator of locators) {
    await expect(locator).toBeVisible();
    expect(await textContrastRatio(locator)).toBeGreaterThanOrEqual(4.5);
  }
}

async function textContrastRatio(locator: Locator): Promise<number> {
  return locator.evaluate(browserContrastRatio, 'text');
}

async function focusRingContrastRatio(locator: Locator): Promise<number> {
  return locator.evaluate(browserContrastRatio, 'focus-ring');
}

function browserContrastRatio(
  element: Element,
  mode: 'text' | 'focus-ring',
): number {
  type Color = {
    red: number;
    green: number;
    blue: number;
    alpha: number;
  };

  function parseColor(value: string): Color {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      throw new Error('Could not create a canvas context for color parsing.');
    }

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;

    return { red, green, blue, alpha: alpha / 255 };
  }

  function effectiveBackground(element: Element): Color {
    let background: Color = { red: 0, green: 0, blue: 0, alpha: 0 };

    for (
      let current: Element | null = element;
      current;
      current = current.parentElement
    ) {
      background = composite(
        background,
        parseColor(getComputedStyle(current).backgroundColor),
      );

      if (background.alpha === 1) {
        return background;
      }
    }

    return composite(background, {
      red: 255,
      green: 255,
      blue: 255,
      alpha: 1,
    });
  }

  function composite(foreground: Color, background: Color): Color {
    const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);

    if (alpha === 0) {
      return { red: 0, green: 0, blue: 0, alpha: 0 };
    }

    return {
      red:
        (foreground.red * foreground.alpha +
          background.red * background.alpha * (1 - foreground.alpha)) /
        alpha,
      green:
        (foreground.green * foreground.alpha +
          background.green * background.alpha * (1 - foreground.alpha)) /
        alpha,
      blue:
        (foreground.blue * foreground.alpha +
          background.blue * background.alpha * (1 - foreground.alpha)) /
        alpha,
      alpha,
    };
  }

  function contrastRatio(first: Color, second: Color): number {
    const firstLuminance = relativeLuminance(first);
    const secondLuminance = relativeLuminance(second);

    return (
      (Math.max(firstLuminance, secondLuminance) + 0.05) /
      (Math.min(firstLuminance, secondLuminance) + 0.05)
    );
  }

  function relativeLuminance(color: Color): number {
    const convert = (channel: number) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : Math.pow((value + 0.055) / 1.055, 2.4);
    };

    return (
      0.2126 * convert(color.red) +
      0.7152 * convert(color.green) +
      0.0722 * convert(color.blue)
    );
  }

  const background = effectiveBackground(element);

  if (mode === 'text') {
    const foreground = composite(
      parseColor(getComputedStyle(element).color),
      background,
    );
    return contrastRatio(foreground, background);
  }

  const shadow = getComputedStyle(element).boxShadow;
  const colors =
    shadow.match(/(?:rgba?|oklch|color)\([^)]*\)/g)?.map(parseColor) ?? [];
  const ring = colors.find(color => color.alpha > 0);

  return ring ? contrastRatio(composite(ring, background), background) : 0;
}
