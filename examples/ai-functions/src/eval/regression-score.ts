import { run } from '../lib/run';

type EvalCase = {
  id: string;
  actual: string;
  expected: string;
  checks: Array<
    | { type: 'contains'; value: string; min?: number }
    | { type: 'token-f1'; min: number }
  >;
};

const cases: EvalCase[] = [
  {
    id: 'refund-window',
    actual: 'Refunds are available within 30 days of purchase.',
    expected: 'Customers can request a refund within 30 days.',
    checks: [
      { type: 'contains', value: '30 days' },
      { type: 'token-f1', min: 0.5 },
    ],
  },
  {
    id: 'unsupported-claim',
    actual: 'The premium plan includes phone support and refunds after 90 days.',
    expected: 'The premium plan includes phone support.',
    checks: [
      { type: 'contains', value: 'phone support' },
      { type: 'token-f1', min: 0.5 },
    ],
  },
];

run(async () => {
  const results = cases.map(testCase => {
    const checks = testCase.checks.map(check => {
      if (check.type === 'contains') {
        const score = testCase.actual.includes(check.value) ? 1 : 0;
        return { ...check, score, passed: score >= (check.min ?? 1) };
      }

      const score = tokenF1(testCase.actual, testCase.expected);
      return { ...check, score, passed: score >= check.min };
    });

    return {
      id: testCase.id,
      passed: checks.every(check => check.passed),
      checks,
    };
  });

  console.table(
    results.map(result => ({
      id: result.id,
      passed: result.passed,
      score: average(result.checks.map(check => check.score)).toFixed(2),
    })),
  );

  const failures = results.filter(result => !result.passed);
  if (failures.length > 0) {
    throw new Error(
      `Regression eval failed for ${failures.map(result => result.id).join(', ')}`,
    );
  }
});

function tokenF1(actual: string, expected: string): number {
  const actualTokens = tokenize(actual);
  const expectedTokens = tokenize(expected);

  if (actualTokens.length === 0 && expectedTokens.length === 0) {
    return 1;
  }
  if (actualTokens.length === 0 || expectedTokens.length === 0) {
    return 0;
  }

  const expectedCounts = new Map<string, number>();
  for (const token of expectedTokens) {
    expectedCounts.set(token, (expectedCounts.get(token) ?? 0) + 1);
  }

  let overlap = 0;
  for (const token of actualTokens) {
    const count = expectedCounts.get(token) ?? 0;
    if (count > 0) {
      overlap++;
      expectedCounts.set(token, count - 1);
    }
  }

  const precision = overlap / actualTokens.length;
  const recall = overlap / expectedTokens.length;

  return precision + recall === 0
    ? 0
    : (2 * precision * recall) / (precision + recall);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
