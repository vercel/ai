type PerplexityMessage = {
  role: string;
  content: string | Array<Record<string, unknown>>;
};

async function main() {
  const { convertToPerplexityMessages } = (await import(
    new URL(
      '../../../../packages/perplexity/src/convert-to-perplexity-messages.ts',
      import.meta.url,
    ).href
  )) as {
    convertToPerplexityMessages: (prompt: unknown) => PerplexityMessage[];
  };

  const failures: string[] = [];

  const topLevelApplicationPdf = convertToPerplexityMessages([
    {
      role: 'user',
      content: [
        {
          type: 'file',
          mediaType: 'application',
          data: { type: 'data', data: 'JVBERi0xLjQ=' },
          filename: 'doc.pdf',
        },
      ],
    },
  ]);

  const expectedPdfContent = [
    {
      type: 'file_url',
      file_url: { url: 'JVBERi0xLjQ=' },
      file_name: 'doc.pdf',
    },
  ];

  if (
    JSON.stringify(topLevelApplicationPdf[0]?.content) !==
    JSON.stringify(expectedPdfContent)
  ) {
    failures.push(
      `Expected a sniffable top-level application/PDF file to remain in the prompt as file_url, but got ${JSON.stringify(
        topLevelApplicationPdf,
      )}.`,
    );
  }

  let unsupportedAudioResult: PerplexityMessage[] | undefined;
  let unsupportedAudioError: unknown;

  try {
    unsupportedAudioResult = convertToPerplexityMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'audio/mpeg',
            data: {
              type: 'data',
              data: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4',
            },
            filename: 'clip.mp3',
          },
        ],
      },
    ]);
  } catch (error) {
    unsupportedAudioError = error;
  }

  if (
    !(
      unsupportedAudioError instanceof Error &&
      unsupportedAudioError.name === 'AI_UnsupportedFunctionalityError'
    )
  ) {
    failures.push(
      `Expected unsupported audio/mpeg file parts to throw UnsupportedFunctionalityError, but got ${JSON.stringify(
        unsupportedAudioResult,
      )}.`,
    );
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
