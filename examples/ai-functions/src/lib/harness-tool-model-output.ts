import type { ModelMessage } from 'ai';
import { randomBytes, randomInt } from 'node:crypto';
import sharp from 'sharp';

const QUADRANTS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const COLORS: Record<string, [number, number, number]> = {
  red: [255, 0, 0],
  green: [0, 160, 0],
  blue: [0, 0, 255],
  yellow: [255, 220, 0],
};

export type HarnessToolModelOutputFixture = {
  image: Uint8Array;
  textMarker: string;
  expectedColors: Record<string, string>;
};

/*
 * The expected colors exist only on the host and inside the PNG. They are
 * never part of the prompt, tool arguments, raw tool output, or sandbox files,
 * so a correct answer proves that the model saw the image the
 * `toModelOutput()` callback returned.
 */
export async function createHarnessToolModelOutputFixture(): Promise<HarnessToolModelOutputFixture> {
  const names = Object.keys(COLORS);
  for (let index = names.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [names[index], names[swap]] = [names[swap]!, names[index]!];
  }
  const expectedColors = Object.fromEntries(
    QUADRANTS.map((quadrant, index) => [quadrant, names[index]!]),
  );
  const size = 256;
  const half = size / 2;
  const tile = (quadrant: string) => {
    const [r, g, b] = COLORS[expectedColors[quadrant]!]!;
    return sharp({
      create: {
        width: half,
        height: half,
        channels: 3,
        background: { r, g, b },
      },
    })
      .png()
      .toBuffer();
  };
  const tiles = await Promise.all(QUADRANTS.map(tile));
  const image = await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(
      QUADRANTS.map((quadrant, index) => ({
        input: tiles[index]!,
        left: quadrant.endsWith('right') ? half : 0,
        top: quadrant.startsWith('bottom') ? half : 0,
      })),
    )
    .png()
    .toBuffer();
  return {
    image: new Uint8Array(image),
    textMarker: `marker-${randomBytes(6).toString('hex')}`,
    expectedColors,
  };
}

export const harnessToolModelOutputPrompt =
  'Call the `inspectImage` tool exactly once. It returns a marker string and a small image made of four colored quadrants. ' +
  'Then answer with exactly these five lines and nothing else:\n' +
  'marker: <the marker string>\n' +
  'top-left: <color>\ntop-right: <color>\nbottom-left: <color>\nbottom-right: <color>\n' +
  'Each of the colors red, green, blue, and yellow appears in exactly one quadrant.';

export function assertHarnessToolModelOutputResult({
  fixture,
  text,
  toolResults,
  responseMessages,
  executionCount,
  conversionCount,
}: {
  fixture: HarnessToolModelOutputFixture;
  text: string;
  toolResults: readonly { toolName: string; output: unknown }[];
  responseMessages: readonly ModelMessage[];
  executionCount: number;
  conversionCount: number;
}): void {
  const failures: string[] = [];
  if (executionCount !== 1)
    failures.push(`execute ran ${executionCount} times`);
  if (conversionCount !== 1)
    failures.push(`toModelOutput ran ${conversionCount} times`);

  const raw = toolResults.find(r => r.toolName === 'inspectImage')?.output;
  if (JSON.stringify(raw) !== JSON.stringify({ status: 'ready' }))
    failures.push(`raw tool output changed: ${JSON.stringify(raw)}`);

  const modelOutput = responseMessages
    .flatMap(message =>
      message.role === 'tool' || message.role === 'assistant'
        ? (message.content as unknown[])
        : [],
    )
    .find(
      (part): part is { type: 'tool-result'; output: any } =>
        typeof part === 'object' &&
        part != null &&
        (part as any).type === 'tool-result' &&
        (part as any).toolName === 'inspectImage',
    )?.output;
  const content: any[] =
    modelOutput?.type === 'content' ? modelOutput.value : [];
  if (!content.some(p => p.type === 'text' && p.text === fixture.textMarker))
    failures.push('responseMessages lack the converted text marker');
  if (
    !content.some(
      p =>
        p.type === 'file' &&
        p.mediaType === 'image/png' &&
        typeof p.data?.data === 'string',
    )
  )
    failures.push('responseMessages lack the converted PNG');

  const lower = text.toLowerCase();
  if (!lower.includes(fixture.textMarker))
    failures.push('answer lacks the text marker');
  for (const [quadrant, color] of Object.entries(fixture.expectedColors)) {
    const match = new RegExp(`${quadrant}\\s*:\\s*([a-z]+)`).exec(lower);
    if (match?.[1] !== color)
      failures.push(`${quadrant}: expected ${color}, got ${match?.[1]}`);
  }

  if (failures.length > 0) {
    throw new Error(
      `toModelOutput verification failed:\n- ${failures.join('\n- ')}\nAnswer:\n${text}`,
    );
  }
}
