const internalLinkBoundary = '(?=[/?#)\\s>]|$)';

const inlineLink = new RegExp(
  `(\\]\\(\\s*<?)(https://ai-sdk\\.dev)?/(docs|providers|cookbook)${internalLinkBoundary}`,
  'g',
);
const referenceLink = new RegExp(
  `^(\\s*\\[[^\\]]+\\]:\\s*<?)(https://ai-sdk\\.dev)?/(docs|providers|cookbook)${internalLinkBoundary}`,
  'gm',
);
const htmlLink = new RegExp(
  `(\\bhref\\s*=\\s*["'])(https://ai-sdk\\.dev)?/(docs|providers|cookbook)${internalLinkBoundary}`,
  'gi',
);

/** Keep links in historical Markdown responses within the selected version. */
export const prefixVersionedMarkdownLinks = (
  markdown: string,
  versionPrefix: string,
) => {
  const replaceLink = (
    _match: string,
    opening: string,
    origin: string | undefined,
    family: string,
  ) => `${opening}${origin ?? ''}${versionPrefix}/${family}`;

  return markdown
    .replace(inlineLink, replaceLink)
    .replace(referenceLink, replaceLink)
    .replace(htmlLink, replaceLink);
};
