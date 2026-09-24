import { transformerMetaHighlight } from '@shikijs/transformers';
import {
  defineGeistdocsSourceConfig,
  geistdocsFrontmatterSchema,
  geistdocsMetaSchema,
  geistShikiTheme,
} from '@vercel/geistdocs/source-config';
import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';
import { defineDocs } from 'fumadocs-mdx/config';

const createDocsCollection = (dir: string) =>
  defineDocs({
    dir,
    docs: {
      schema: geistdocsFrontmatterSchema,
      postprocess: {
        includeProcessedMarkdown: true,
      },
    },
    meta: {
      schema: geistdocsMetaSchema,
    },
  });

export const docsV5 = createDocsCollection('content/v5/docs');
export const docsV6 = createDocsCollection('content/v6/docs');
export const docsV7 = createDocsCollection('content/v7/docs');
export const providersV5 = createDocsCollection('content/v5/providers');
export const providersV6 = createDocsCollection('content/v6/providers');
export const providersV7 = createDocsCollection('content/v7/providers');
export const cookbookV5 = createDocsCollection('content/v5/cookbook');
export const cookbookV6 = createDocsCollection('content/v6/cookbook');
export const cookbookV7 = createDocsCollection('content/v7/cookbook');

export default defineGeistdocsSourceConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      // Themes are overridden by defineGeistdocsSourceConfig at runtime, but
      // required at the type level when passing rehypeCodeOptions.
      themes: { light: geistShikiTheme, dark: geistShikiTheme },
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        // Supports `{1,3-5}` fence meta produced by the sync-content
        // transform from the legacy `highlight="1,3-5"` convention.
        transformerMetaHighlight(),
      ],
    },
  },
});
