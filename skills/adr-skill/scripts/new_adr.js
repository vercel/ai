#!/usr/bin/env node
/**
 * Create a new ADR markdown file using repo conventions and a template.
 *
 * Design goals:
 * - Date-prefixed filenames using the repository convention
 * - No external deps
 * - Works even if the repo has no ADRs yet
 */

const fs = require('node:fs');
const path = require('node:path');

function die(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
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

function parseArgs(argv) {
  const out = {
    repoRoot: '.',
    dir: null,
    noCreateDir: false,
    title: null,
    updateIndex: false,
    indexFile: null,
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
    else if (a === '--no-create-dir') out.noCreateDir = true;
    else if (a === '--title') out.title = next();
    else if (a === '--update-index') out.updateIndex = true;
    else if (a === '--index-file') out.indexFile = next();
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        [
          'Usage: node new_adr.js --title "Choose database" [options]',
          '',
          'Options:',
          '  --repo-root <path>     Repo root (default: .)',
          '  --dir <path>           ADR directory (default: auto-detect, else adr/)',
          '  --no-create-dir        Do not create ADR directory if missing',
          '  --update-index         Update adr/README.md (or existing index)',
          '  --index-file <path>    Override index file (relative to repo root unless absolute)',
          '  --json                 Output machine-readable JSON (default: off)',
          '',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      die(`Unknown arg: ${a}`);
    }
  }

  if (!out.title) die('Missing required --title');

  return out;
}

function detectAdrDir(repoRoot) {
  const candidates = [
    path.join(repoRoot, 'contributing', 'decisions'),
    path.join(repoRoot, 'docs', 'decisions'),
    path.join(repoRoot, 'adr'),
    path.join(repoRoot, 'docs', 'adr'),
    path.join(repoRoot, 'docs', 'adrs'),
    path.join(repoRoot, 'decisions'),
  ];
  for (const p of candidates) {
    try {
      if (fs.statSync(p).isDirectory()) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function loadTemplate() {
  const skillRoot = path.resolve(__dirname, '..');
  const templatePath = path.join(
    skillRoot,
    'assets',
    'templates',
    'adr-simple.md',
  );
  if (!fs.existsSync(templatePath)) die(`Template not found: ${templatePath}`);
  return fs.readFileSync(templatePath, 'utf8');
}

function chooseIndexFile(adrDir) {
  for (const name of ['README.md', 'index.md']) {
    const p = path.join(adrDir, name);
    if (fs.existsSync(p)) return p;
  }
  return path.join(adrDir, 'README.md');
}

function insertIndexEntryUnderHeading(lines, headingRegex, entryLine) {
  // Returns { lines, inserted }
  const headingIndex = lines.findIndex(l => headingRegex.test(l));
  if (headingIndex === -1) return { lines, inserted: false };

  let sectionEnd = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  // Prefer inserting at end of list in this section if there is a list.
  let lastListItem = -1;
  for (let i = sectionEnd - 1; i > headingIndex; i--) {
    if (/^[-*]\s+/.test(lines[i])) {
      lastListItem = i;
      break;
    }
  }

  const insertAt = lastListItem !== -1 ? lastListItem + 1 : sectionEnd;

  const out = [...lines];

  // Ensure there's a blank line after the heading if we're inserting immediately after it.
  if (insertAt === headingIndex + 1 && out[insertAt] !== '') {
    out.splice(insertAt, 0, '');
  }

  out.splice(insertAt, 0, entryLine);
  return { lines: out, inserted: true };
}

function updateIndex(indexFile, { relLink, title, date }) {
  let content = '';
  if (fs.existsSync(indexFile)) content = fs.readFileSync(indexFile, 'utf8');
  else content = '# ADR Log\n\n';

  if (content.includes(relLink)) return false;

  const normalized = content.replace(/\r\n/g, '\n');
  const hadTrailingNewline = normalized.endsWith('\n');
  let lines = normalized.split('\n');
  // Normalize away the trailing empty split element so insertion math is sane.
  if (
    hadTrailingNewline &&
    lines.length > 0 &&
    lines[lines.length - 1] === ''
  ) {
    lines = lines.slice(0, -1);
  }
  const entryLine = `- [${title}](${relLink}) (${date})`;

  // Prefer inserting under "## ADRs" if it exists, otherwise append at EOF.
  const r = insertIndexEntryUnderHeading(lines, /^##\s+ADRs\s*$/i, entryLine);
  const nextLines = r.inserted ? r.lines : [...lines, entryLine];

  let next = nextLines.join('\n');
  if (hadTrailingNewline) next += '\n';

  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  fs.writeFileSync(indexFile, next, 'utf8');
  return true;
}

function main() {
  const args = parseArgs(process.argv);

  const repoRoot = path.resolve(process.cwd(), args.repoRoot);
  if (!fs.existsSync(repoRoot)) die(`Repo root does not exist: ${repoRoot}`);

  let adrDir;
  if (args.dir) adrDir = path.resolve(repoRoot, args.dir);
  else adrDir = detectAdrDir(repoRoot) || path.join(repoRoot, 'adr');

  if (!fs.existsSync(adrDir)) {
    if (args.noCreateDir) die(`ADR directory does not exist: ${adrDir}`);
    fs.mkdirSync(adrDir, { recursive: true });
  }

  const title = String(args.title).trim();
  const slug = slugify(title);

  const today = todayISO();

  const filename = `${today}-${slug}.md`;
  const out = path.join(adrDir, filename);
  if (fs.existsSync(out)) die(`ADR already exists: ${out}`);

  const rendered = loadTemplate().replaceAll('{TITLE}', title);

  fs.writeFileSync(out, `${rendered.trimEnd()}\n`, 'utf8');

  let updatedIndexPath = null;
  let indexChanged = false;

  if (args.updateIndex) {
    let indexFile;
    if (args.indexFile) {
      indexFile = path.isAbsolute(args.indexFile)
        ? args.indexFile
        : path.resolve(repoRoot, args.indexFile);
    } else {
      indexFile = chooseIndexFile(adrDir);
    }

    const relLink = toPosix(path.relative(path.dirname(indexFile), out));
    indexChanged = updateIndex(indexFile, {
      relLink,
      title,
      date: today,
    });
    updatedIndexPath = indexFile;
  }

  if (args.json) {
    const payload = {
      repoRoot,
      adrDir,
      createdAdrPath: out,
      createdAdrRelPath: toPosix(path.relative(repoRoot, out)),
      title,
      date: today,
      indexUpdated: Boolean(updatedIndexPath),
      indexChanged,
      indexPath: updatedIndexPath,
      indexRelPath: updatedIndexPath
        ? toPosix(path.relative(repoRoot, updatedIndexPath))
        : null,
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } else {
    process.stdout.write(`${out}\n`);
  }
}

main();
