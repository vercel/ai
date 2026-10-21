import type * as UnpdfModule from 'unpdf';

let unpdfPromise: Promise<typeof UnpdfModule> | undefined;

export async function pdfToText(
  data: Uint8Array,
): Promise<{ title: string | undefined; content: string }> {
  // Loaded on first use: unpdf bundles PDF.js, which is large.
  unpdfPromise ??= import('unpdf');
  const { extractText, getDocumentProxy, getMeta } = await unpdfPromise;

  const pdf = await getDocumentProxy(data);

  try {
    const [{ text }, meta] = await Promise.all([
      extractText(pdf, { mergePages: true }),
      // The title is optional, so invalid metadata must not fail extraction.
      getMeta(pdf).catch(() => undefined),
    ]);

    const title = meta?.info.Title;

    return {
      title:
        typeof title === 'string' && title.trim() !== ''
          ? title.trim()
          : undefined,
      content: text.trim(),
    };
  } finally {
    await pdf.loadingTask.destroy();
  }
}
