import type { StreamTranscriptionResult } from 'ai';

/**
 * Pretty-prints an `experimental_streamTranscribe` result to the terminal.
 *
 * - `transcript-delta` parts are written inline (append-only tokens).
 * - `transcript-partial` parts are shown as revisable interim lines.
 * - `transcript-final` parts are printed as committed segments/utterances.
 * - `error` parts are surfaced without tearing down the whole stream.
 *
 * After the stream ends, the resolved `text`, `segments`, and `warnings`
 * promises are printed.
 */
export async function printTranscriptionStream({
  result,
}: {
  result: StreamTranscriptionResult;
}) {
  process.stdout.write('\n\x1b[1mLIVE TRANSCRIPT\x1b[22m\n');

  let wroteDelta = false;

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'transcript-delta': {
        // Append-only tokens, e.g. OpenAI gpt-realtime-whisper deltas.
        process.stdout.write(part.delta);
        wroteDelta = true;
        break;
      }

      case 'transcript-partial': {
        // Interim (revisable) results, e.g. xAI interim_results.
        const channel =
          part.channelIndex == null ? '' : `\x1b[2m[ch${part.channelIndex}]\x1b[22m `;
        process.stdout.write(
          `\n\x1b[2m~ ${channel}${part.text}\x1b[22m`,
        );
        break;
      }

      case 'transcript-final': {
        if (wroteDelta) {
          process.stdout.write('\n');
          wroteDelta = false;
        }
        const channel =
          part.channelIndex == null ? '' : `\x1b[2m[ch${part.channelIndex}]\x1b[22m `;
        process.stdout.write(
          `\x1b[32m\x1b[1m✓ ${channel}\x1b[22m${part.text}\x1b[0m\n`,
        );
        break;
      }

      case 'error': {
        process.stderr.write(
          `\n\x1b[31m\x1b[1mERROR\x1b[22m ${formatStreamError(part.error)}\x1b[0m\n`,
        );
        break;
      }
    }
  }

  const [text, segments, warnings] = await Promise.all([
    result.text,
    result.segments,
    result.warnings,
  ]);

  console.log('\n\x1b[1mFINAL TEXT\x1b[22m');
  console.log(text);

  if (segments.length) {
    console.log('\n\x1b[1mSEGMENTS\x1b[22m');
    console.log(segments);
  }

  if (warnings.length) {
    console.log('\n\x1b[1mWARNINGS\x1b[22m');
    console.log(warnings);
  }
}

function formatStreamError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return JSON.stringify(error);
}
