import fs from 'node:fs/promises';

const BYPASS_LABELS = ['minor', 'major'];

// Extensions considered as source code (not tests, not docs)
const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mts|mjs|cts|cjs)$/;
// Patterns considered as test files
const TEST_FILE_PATTERNS = /\.(test|spec)\.(ts|js|tsx|jsx|mts|mjs)$|\.test-d\.ts$/;

function isCodeFile(path) {
  if (!path.startsWith('packages/')) return false;
  if (TEST_FILE_PATTERNS.test(path)) return false;
  if (path.endsWith('.md')) return false;
  return CODE_EXTENSIONS.test(path);
}

// check if current file is the entry point
if (import.meta.url.endsWith(process.argv[1])) {
  // https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request
  const pullRequestEvent = JSON.parse(
    await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf-8'),
  );

  try {
    const message = await verifyChangesets(
      pullRequestEvent,
      process.env,
      fs.readFile,
    );
    await fs.writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Changeset verification passed ✅\n\n${message || ''}`,
    );
  } catch (error) {
    // write error to summary
    console.error(error.message);
    await fs.writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Changeset verification failed ❌

${error.message}`,
    );

    if (error.path) {
      await fs.appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `\n\nFile: \`${error.path}\``,
      );
    }

    if (error.content) {
      await fs.appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `\n\n\`\`\`yaml\n${error.content}\n\`\`\``,
      );
    }

    process.exit(1);
  }
}

export async function verifyChangesets(
  event,
  env = process.env,
  readFile = fs.readFile,
) {
  // Skip check if pull request has "minor-release" label
  const byPassLabel = event.pull_request.labels.find(label =>
    BYPASS_LABELS.includes(label.name),
  );
  if (byPassLabel) {
    return `Skipping changeset verification - "${byPassLabel.name}" label found`;
  }

  // Check that all packages with code changes are covered by a changeset
  const packageFiles = (env.CHANGED_PACKAGE_FILES || '').trim();
  if (packageFiles) {
    const codeFiles = packageFiles.split(/\s+/).filter(isCodeFile);

    if (codeFiles.length > 0) {
      // Extract unique package directories (e.g. "packages/ai" from "packages/ai/src/index.ts")
      const packageDirs = [
        ...new Set(codeFiles.map(f => f.split('/').slice(0, 2).join('/'))),
      ];

      // Map package directories to npm package names via package.json
      const changedPackageNames = [];
      for (const dir of packageDirs) {
        try {
          const pkgJson = JSON.parse(
            await readFile(`../../../../${dir}/package.json`, 'utf-8'),
          );
          if (pkgJson.name && !pkgJson.private) {
            changedPackageNames.push(pkgJson.name);
          }
        } catch {
          // skip if package.json cannot be read
        }
      }

      if (changedPackageNames.length > 0) {
        const changesetFiles = (env.CHANGED_FILES || '')
          .trim()
          .split(/\s+/)
          .filter(
            f =>
              f &&
              f !== '.changeset/README.md' &&
              /^\.changeset\/[a-z-]+\.md$/.test(f),
          );

        if (changesetFiles.length === 0) {
          throw new Error(
            `Missing changeset - packages were modified but no .changeset/*.md file was found. Run 'pnpm changeset' to create one.`,
          );
        }

        // Collect all package names covered by the changeset files
        const coveredPackages = new Set();
        for (const path of changesetFiles) {
          const content = await readFile(`../../../../${path}`, 'utf-8');
          const result = content.match(/---\n([\s\S]+?)\n---/);
          if (result) {
            for (const line of result[1].split('\n').filter(Boolean)) {
              const rawName = line.split(':')[0].trim();
              // Strip surrounding quotes (e.g. `'@ai-sdk/openai'` → `@ai-sdk/openai`)
              const name = rawName.replace(/^['"]|['"]$/g, '');
              if (name) coveredPackages.add(name);
            }
          }
        }

        const missingPackages = changedPackageNames.filter(
          n => !coveredPackages.has(n),
        );
        if (missingPackages.length > 0) {
          throw new Error(
            `Missing changeset entries for packages: ${missingPackages.join(', ')}. Make sure all modified packages are listed in a .changeset/*.md file.`,
          );
        }
      }
    }
  }

  // Iterate through all changed .changeset/*.md files
  for (const path of (env.CHANGED_FILES || '').trim().split(' ').filter(Boolean)) {
    // ignore README.md file
    if (path === '.changeset/README.md') continue;

    // Check if the file is a .changeset file
    if (!/^\.changeset\/[a-z-]+\.md/.test(path)) {
      throw Object.assign(new Error(`Invalid file - not a .changeset file`), {
        path,
      });
    }

    // find frontmatter
    const content = await readFile(`../../../../${path}`, 'utf-8');
    const result = content.match(/---\n([\s\S]+?)\n---/);
    if (!result) {
      throw Object.assign(
        new Error(`Invalid .changeset file - no frontmatter found`),
        {
          path,
          content,
        },
      );
    }

    const [frontmatter] = result;

    // Find version bump by package. `frontmatter` looks like this:
    //
    // ```yaml
    // 'ai': patch
    // '@ai-sdk/provider': patch
    // ```
    const lines = frontmatter.split('\n').slice(1, -1);
    const versionBumps = {};
    for (const line of lines) {
      const [packageName, versionBump] = line.split(':').map(s => s.trim());
      if (!packageName || !versionBump) {
        throw Object.assign(
          new Error(`Invalid .changeset file - invalid frontmatter`, {
            path,
            content,
          }),
        );
      }

      // Check if packageName is already set
      if (versionBumps[packageName]) {
        throw Object.assign(
          new Error(
            `Invalid .changeset file - duplicate package name "${packageName}"`,
          ),
          { path, content },
        );
      }

      versionBumps[packageName] = versionBump;
    }

    // check if any of the version bumps are not "patch"
    const invalidVersionBumps = Object.entries(versionBumps).filter(
      ([, versionBump]) => versionBump !== 'patch',
    );

    if (invalidVersionBumps.length > 0) {
      throw Object.assign(
        new Error(
          `Invalid .changeset file - invalid version bump (only "patch" is allowed, see https://ai-sdk.dev/docs/migration-guides/versioning). To bypass, add one of the following labels: ${BYPASS_LABELS.join(', ')}`,
        ),

        { path, content },
      );
    }
  }
}
