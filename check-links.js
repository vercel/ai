const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
let chalk;

const markdownLinkRegex = /\[.*?\]\((.*?)\)/g;
const projectRoot = process.cwd(); // Gets the current working directory

const skipKnownBrokenLinks = [
  { from: '/docs/concepts/prompt-engineering.mdx', to: '/prompt' },
];

async function checkMarkdownLinks(baseDir) {
  // chalk = (await import('chalk')).default;
  const files = glob.sync(`${baseDir}/**/*.mdx`);
  let errorCount = 0;
  chalk = (await import('chalk')).default;

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const relativeFilePath = `/${path.relative(baseDir, file)}`;
    let match;

    while ((match = markdownLinkRegex.exec(content)) !== null) {
      const originalLink = match[1];
      let link = originalLink;

      if (
        skipKnownBrokenLinks.some(
          skip => skip.from === relativeFilePath && skip.to === link,
        )
      )
        continue;

      // Skip external links
      if (link.startsWith('http') || link.startsWith('//')) continue;

      // Skip links which have an extension (e.g., .png)
      if (path.extname(link)) continue;

      // For absolute paths, prepend the documentation root path
      // For relative paths, resolve the path from the current file
      if (link.startsWith('/')) {
        link = path.join(docsRoot, link);
      } else if (link.startsWith('./')) {
        link = path.resolve(path.dirname(file), link);
      }

      // If the link has an anchor, only use the root
      if (link.includes('#')) {
        const [linkPath, _anchor] = link.split('#');
        link = linkPath;
      }

      // Add markdown extension
      link += '.mdx';

      const relativeLinkPath = `/${path.relative(baseDir, link)}`;

      try {
        await fs.access(link);
        console.log(
          chalk.green(
            `✓ ${relativeFilePath} -> ${originalLink} (${relativeLinkPath})`,
          ),
        );
      } catch (error) {
        errorCount += 1;
        console.error(
          chalk.red(
            `✖ ${relativeFilePath} -> ${originalLink} (${relativeLinkPath})`,
          ),
        );
      }
    }
  }

  // After all links have been checked:
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
