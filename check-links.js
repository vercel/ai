const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
let chalk;

// For the times when we know that we shouldn't resolve something
// e.g., the `/prompt` page is a relative link, but is not in the docs
const knownBrokenLinks = [
  { from: '/docs/concepts/prompt-engineering.mdx', to: '/prompt' },
];

const markdownLinkRegex = /\[.*?\]\((.*?)\)/g;
const hrefLinkRegex = /href="(.*?)"/g;

const hasExtension = link => path.extname(link);

const isExternalLink = link => link.startsWith('http') || link.startsWith('//');

const isKnownBrokenLink = (from, to) => {
  return knownBrokenLinks.some(skip => skip.from === from && skip.to === to);
};

const resolveLink = ({ docsRoot, file, link }) => {
  let resolvedLink = link;

  // For absolute paths, prepend the documentation root path
  // For relative paths, resolve the path from the current file
  if (resolvedLink.startsWith('/')) {
    resolvedLink = path.join(docsRoot, resolvedLink);
  } else if (resolvedLink.startsWith('./')) {
    resolvedLink = path.resolve(path.dirname(file), resolvedLink);
  }

  // If the resolvedLink has an anchor, only use the root
  if (resolvedLink.includes('#')) {
    const [linkPath, _anchor] = resolvedLink.split('#');
    resolvedLink = linkPath;
  }

  // Add markdown extension
  resolvedLink += '.mdx';

  return resolvedLink;
};

const shouldSkip = (from, to) => {
  return isKnownBrokenLink(from, to) || isExternalLink(to) || hasExtension(to);
};

async function checkMarkdownLinks(baseDir) {
  const files = glob.sync(`${baseDir}/**/*.mdx`);
  let errorCount = 0;
  chalk = (await import('chalk')).default;

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const relativeFilePath = `/${path.relative(baseDir, file)}`;

    const links = [];
    let match;

    // Gather all Markdown links
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      links.push(match[1]); // Capture the link
    }

    // Gather all HTML href links
    while ((match = hrefLinkRegex.exec(content)) !== null) {
      links.push(match[1]); // Capture the href value
    }

    // Iterate over the combined list of links
    for (const link of links) {
      if (shouldSkip(relativeFilePath, link)) {
        console.log(chalk.grey(`· ${relativeFilePath} -> ${link}`));
        continue;
      }

      const resolvedLink = resolveLink({ docsRoot, file, link });
      const relativeLinkPath = `/${path.relative(baseDir, resolvedLink)}`;

      try {
        await fs.access(resolvedLink);
        console.log(
          chalk.green(`✓ ${relativeFilePath} -> ${link} (${relativeLinkPath})`),
        );
      } catch (error) {
        errorCount += 1;
        console.error(
          chalk.red(`✖ ${relativeFilePath} -> ${link} (${relativeLinkPath})`),
        );
      }
    }
  }

  // After all links have been checked
  if (errorCount > 0) {
    console.error(
      chalk.red(
        `\n✖ ${errorCount} broken link(s) detected. Exiting with error.\n`,
      ),
    );
    process.exit(1); // Exit with a non-zero exit code to indicate error
  } else {
    console.log(
      chalk.green('\n✓ No broken links found. Exiting successfully.\n'),
    );
    process.exit(0); // Exit with zero to indicate success
  }
}

const docsRoot = path.resolve(__dirname, './docs/pages');
checkMarkdownLinks(docsRoot);
