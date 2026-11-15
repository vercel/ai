#!/usr/bin/env node
/**
 * Bootstrap ADRs in a repo:
 * - create ADR directory
 * - create adr/README.md (index) using a template
 * - create first ADR: "Adopt architecture decision records"
 */

const fs = require('node:fs');
const path = require('node:path');

function die(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {
    repoRoot: '.',
    dir: 'adr',
    forceIndex: false,
    indexFile: null,
    firstTitle: 'Adopt architecture decision records',
    json: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) die(`Missing value for ${a}`);
      return argv[++i];
    };

    if (a === '--repo-root') out.repoRoot = next();
    else if (a === '--dir') out.dir = next();
    else if (a === '--force-index') out.forceIndex = true;
    else if (a === '--index-file') out.indexFile = next();
    else if (a === '--first-title') out.firstTitle = next();
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        [
          'Usage: node bootstrap_adr.js [options]',
          '',
          'Options:',
          '  --repo-root <path>     Repo root (default: .)',
          '  --dir <path>           ADR directory (default: adr)',
          '  --index-file <path>    Override index file path (relative to repo root unless absolute)',
          '  --force-index          Overwrite index file if it exists',
          '  --first-title <text>   Title for initial ADR',
          '  --json                 Output machine-readable JSON (default: off)',
          '',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      die(`Unknown arg: ${a}`);
    }
  }

  return out;
}

function loadReadmeTemplate() {
  const skillRoot = path.resolve(__dirname, '..');
  const templatePath = path.join(
    skillRoot,
    'assets',
    'templates',
    'adr-readme.md',
  );
  if (!fs.existsSync(templatePath))
    die(`README template not found: ${templatePath}`);
  return fs.readFileSync(templatePath, 'utf8');
}

function writeIndex(indexFile, adrDirName, { force }) {
  if (fs.existsSync(indexFile) && !force) return;
  const content = loadReadmeTemplate().replaceAll('{ADR_DIR}', adrDirName);
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  fs.writeFileSync(indexFile, `${content.trimEnd()}\n`, 'utf8');
}

function slugify(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase();
  const noQuotes = t.replace(/['"`]/g, '');
  const dashed = noQuotes.replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-');
  const trimmed = dashed.replace(/^-+/, '').replace(/-+$/, '');
  return trimmed || 'decision';
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function generateFirstAdr({ title, adrDir }) {
  return `# ${title}

## Context and Problem Statement

Architecture decisions in this project are made implicitly — through code, conversations, and tribal knowledge. When a new contributor (human or AI agent) joins the codebase, there is no record of *why* things are built the way they are. This makes it hard to:

- Understand whether a pattern is intentional or accidental
- Know if a past decision still applies or has been superseded
- Avoid relitigating decisions that were already carefully considered

We need a lightweight, version-controlled way to capture decisions where the code lives.

## Decision

Adopt Architecture Decision Records (ADRs), stored in \`${adrDir}/\`.

Conventions:

- One ADR per file, named \`YYYY-MM-DD-title-with-dashes.md\`
- An ADR is accepted when its pull request merges; an explicit status is unnecessary
- Superseded ADRs link to their replacement
- Use Context and Problem Statement, Decision, Alternatives Considered, and optional More Information
- Omit YAML frontmatter and explicit status fields
- Include tradeoffs with the decision and alternatives; keep implementation plans and verification in issues or PRs
- ADRs are self-contained so contributors and coding agents can understand the decision and its rationale

Decisions are discoverable and version-controlled alongside the code, helping contributors understand the rationale and avoid relitigating settled questions. Writing records takes time, and they need periodic review to mark outdated decisions as deprecated or superseded.

## Alternatives Considered

- No formal records: Continue making decisions in conversations and code comments. Rejected because context is lost and decisions get relitigated.
- Wiki or Notion pages: Capture decisions outside the repo. Rejected because they drift out of sync with the code and are not version-controlled.
- Lightweight RFCs: A more heavyweight process with formal review cycles. Rejected as overkill for most decisions; ADRs can expand the analysis when needed.

## More Information

- Michael Nygard, "Documenting Architecture Decisions": <https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions>`;
}

function updateIndexFile(indexFile, { relLink, title, date }) {
  if (!fs.existsSync(indexFile)) return;
  let content = fs.readFileSync(indexFile, 'utf8');
  if (content.includes(relLink)) return;

  const entryLine = `- [${title}](${relLink}) (${date})`;

  // Append after "## ADRs" heading if found, otherwise append at end
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const headingIdx = lines.findIndex(l => /^##\s+ADRs\s*$/i.test(l));

  if (headingIdx !== -1) {
    // Insert after the heading (and any blank line after it)
    let insertAt = headingIdx + 1;
    while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt++;
    lines.splice(insertAt, 0, entryLine);
  } else {
    lines.push(entryLine);
  }

  fs.writeFileSync(indexFile, lines.join('\n'), 'utf8');
}

function main() {
  const args = parseArgs(process.argv);

  const repoRoot = path.resolve(process.cwd(), args.repoRoot);
  if (!fs.existsSync(repoRoot)) die(`Repo root does not exist: ${repoRoot}`);

  const adrDir = path.resolve(repoRoot, args.dir);
  fs.mkdirSync(adrDir, { recursive: true });

  const indexFile = args.indexFile
    ? path.isAbsolute(args.indexFile)
      ? args.indexFile
      : path.resolve(repoRoot, args.indexFile)
    : path.join(adrDir, 'README.md');

  const indexExistedBefore = fs.existsSync(indexFile);
  writeIndex(indexFile, args.dir, { force: args.forceIndex });
  const indexWritten =
    fs.existsSync(indexFile) && (!indexExistedBefore || args.forceIndex);

  // Create the first ADR as a filled-out decision (not a blank template).
  const relIndex = path.isAbsolute(indexFile)
    ? path.relative(repoRoot, indexFile)
    : indexFile;
  const today = new Date().toISOString().slice(0, 10);

  const firstAdrContent = generateFirstAdr({
    title: args.firstTitle,
    adrDir: args.dir,
  });

  const firstAdrFilename = `${today}-${slugify(args.firstTitle)}.md`;
  const firstAdrPath = path.join(adrDir, firstAdrFilename);
  fs.writeFileSync(firstAdrPath, `${firstAdrContent.trimEnd()}\n`, 'utf8');

  // Update index
  const relLink = toPosix(path.relative(path.dirname(indexFile), firstAdrPath));
  updateIndexFile(indexFile, {
    relLink,
    title: args.firstTitle,
    date: today,
  });

  if (args.json) {
    const payload = {
      repoRoot,
      adrDir,
      adrDirRelPath: toPosix(path.relative(repoRoot, adrDir)),
      indexPath: indexFile,
      indexRelPath: toPosix(relIndex),
      indexExistedBefore,
      indexWritten,
      firstAdr: {
        createdAdrPath: firstAdrPath,
        createdAdrRelPath: toPosix(path.relative(repoRoot, firstAdrPath)),
        title: args.firstTitle,
        date: today,
      },
      date: today,
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  process.stdout.write(`${firstAdrPath}\n`);
  process.stdout.write(`Bootstrapped ADRs at ${adrDir} (${today})\n`);
  process.stdout.write(`Index: ${indexFile}\n`);
}

main();
