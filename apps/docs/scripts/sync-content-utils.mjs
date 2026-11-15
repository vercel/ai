import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** Returns { prefix, clean } for a `NN-name` path segment. */
export const parseSegment = segment => {
  const match = segment.match(/^(\d+)-(.+)$/);
  return match
    ? { prefix: Number(match[1]), clean: match[2] }
    : { prefix: null, clean: segment };
};

/** Strips the first in-body `# H1` line (frontmatter title is the page H1). */
const stripLeadingH1 = mdx => {
  const fmMatch = mdx.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const fmEnd = fmMatch ? fmMatch[0].length : 0;
  const body = mdx.slice(fmEnd);
  const stripped = body.replace(/^\s*#[ \t][^\n]*\n?/, "\n");
  return mdx.slice(0, fmEnd) + stripped;
};

const linkReplacements = [
  ['#ui-message-stream-protocol', '#data-stream-protocol'],
  ['#ui-message-stream', '#ui-message-stream-example'],
  ['#multi-modal-messages', '#file-parts'],
  ['#validating-messages-from-database', '#validating-messages-on-the-server'],
  ['#multi-step-calls', '#multi-step-calls-using-stopwhen'],
  ['#attachments-experimental', '#attachments'],
  [
    '#structured-outputs-with-generatetext-and-streamtext',
    '#generating-structured-outputs',
  ],
  [
    '#simulate-data-stream-protocol-responses',
    '#simulate-ui-message-stream-responses',
  ],
  ['#tools-generate', '#tools.tool.generate'],
  ['#tooloopagent-class', '#toolloopagent-class'],
];

const rewriteLegacyLinks = line =>
  linkReplacements.reduce((rewritten, [from, to]) => {
    if (to.startsWith(from)) {
      const suffix = to.slice(from.length).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!${suffix})`,
        'g',
      );
      return rewritten.replace(pattern, to);
    }
    return rewritten.replaceAll(from, to);
  }, line);

/**
 * Rewrites code fence meta to fumadocs conventions and drops top-level MDX
 * imports that next-mdx-remote previously ignored.
 */
const rewriteLines = mdx => {
  let inFence = false;

  return mdx
    .split("\n")
    .map(line => {
      if (line.trimStart().startsWith("```")) {
        inFence = !inFence;
        let next = line.replace(
          /\b(?:filename|file)=(?:\{)?(["'])([^"']+)\1(?:\})?/g,
          'title=$1$2$1',
        );
        next = next.replace(
          /\bhighlight=(?:\{)?(["'])([^"']+)\1(?:\})?/g,
          '{$2}',
        );
        // Strip stray quotes attached to the fence language (upstream
        // content typos such as ```typescript").
        next = next.replace(/^(\s*```)([a-zA-Z-]+)["']+(\s*)$/, '$1$2$3');
        // Remap fence languages Shiki doesn't bundle.
        next = next.replace(/^(\s*```)prompt\b/, '$1txt');
        next = next.replace(/^(\s*```)env\b/, '$1dotenv');
        next = next.replace(/^(\s*```)rego\b/, '$1txt');
        return next;
      }
      if (!inFence && /^import\s/.test(line)) {
        return null;
      }
      const rewrittenLine = !inFence ? rewriteLegacyLinks(line) : line;
      if (
        !inFence &&
        /^#{1,6}\s/.test(rewrittenLine) &&
        /<[A-Z]/.test(rewrittenLine)
      ) {
        // Heading JSX is unavailable in fumadocs' module-scope TOC export.
        return rewrittenLine
          .replace(/<([A-Z][\w.]*)[^>]*>([^<]*)<\/\1>/g, '($2)')
          .replace(/<[A-Z][\w.]*[^>]*\/>/g, '')
          .trimEnd();
      }
      return rewrittenLine;
    })
    .filter(line => line !== null)
    .join("\n");
};

const addLegacyAnchors = mdx => {
  const title = mdx.match(/^---\r?\n[\s\S]*?^title:\s*(.+)$/m)?.[1]?.trim();

  if (title === 'streamText') {
    return mdx.replace(
      '\n### Returns',
      '\n<span id="result" />\n<span id="result-object" />\n\n### Returns',
    );
  }
  if (title === 'Output') {
    return mdx.replace(
      '\n### `Output.object()`',
      '\n<span id="output-object" />\n\n### `Output.object()`',
    );
  }
  if (title === 'Telemetry') {
    const frontmatter = mdx.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    const offset = frontmatter?.[0].length ?? 0;
    return `${mdx.slice(0, offset)}\n<span id="telemetry" />\n${mdx.slice(offset)}`;
  }
  return mdx;
};

export const transformMdx = mdx =>
  addLegacyAnchors(stripLeadingH1(rewriteLines(mdx)));

const frontmatterOf = mdx => {
  const match = mdx.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return match ? match[1] : "";
};

const bodyOf = mdx => {
  const match = mdx.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return mdx.slice(match ? match[0].length : 0);
};

const titleOf = mdx => {
  const raw = frontmatterOf(mdx).match(/^title:\s*(.+)$/m)?.[1]?.trim();
  return raw?.replace(/^(['"])(.*)\1$/, "$2");
};

/**
 * Recursively transforms `srcDir` into `outDir`, returning the ordered list
 * of clean entry names for the parent meta.json.
 *
 * Folders that contain both an `index.mdx` and an `overview.mdx` drop the
 * index (legacy ai-sdk.dev card-grid landing pages): Geistdocs' sidebar
 * surfaces folder index pages as a synthetic "Overview" item, which would
 * duplicate the real Overview page. `next.config.ts` redirects the folder
 * URL to the overview page. Frontmatter signals on the dropped index (such
 * as `collapsed: true`) still apply to the folder's meta.json.
 *
 * Frontmatter-only index pages (cookbook sections) are dropped the same
 * way: the legacy app never rendered them (it redirected the section URL to
 * its first recipe, which `next.config.ts` mirrors), so keeping them would
 * add empty "Overview" pages to the sidebar, sitemap, and llms surfaces.
 */
export const transformDir = (srcDir, outDir, relPath = "") => {
  mkdirSync(outDir, { recursive: true });

  const entries = readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => {
      const { prefix, clean } = parseSegment(
        entry.isDirectory() ? entry.name : entry.name.replace(/\.mdx$/, "")
      );
      return { entry, prefix, clean };
    })
    .sort(
      (a, b) =>
        (a.prefix ?? Number.MAX_SAFE_INTEGER) -
          (b.prefix ?? Number.MAX_SAFE_INTEGER) ||
        a.clean.localeCompare(b.clean)
    );

  const hasOverviewPage = entries.some(
    ({ entry, clean }) =>
      !entry.isDirectory() && entry.name.endsWith(".mdx") && clean === "overview"
  );

  const seen = new Map();
  const pages = [];
  let defaultOpen;
  let folderTitle;

  for (const { entry, clean } of entries) {
    const srcPath = join(srcDir, entry.name);

    if (seen.has(clean)) {
      throw new Error(
        `prefix-strip collision in ${relPath || "."}: "${entry.name}" and "${seen.get(clean)}" both map to "${clean}"`
      );
    }
    seen.set(clean, entry.name);

    if (entry.isDirectory()) {
      transformDir(srcPath, join(outDir, clean), join(relPath, clean));
      pages.push(clean);
    } else if (entry.name.endsWith(".mdx")) {
      const mdx = readFileSync(srcPath, "utf8");
      if (clean === "index" && /^collapsed:\s*true/m.test(frontmatterOf(mdx))) {
        defaultOpen = false;
      }
      if (clean === "index" && (hasOverviewPage || bodyOf(mdx).trim() === "")) {
        // Without an index page the folder would fall back to a
        // slug-derived display name; keep the index title on the folder.
        folderTitle = titleOf(mdx);
        continue;
      }
      writeFileSync(join(outDir, `${clean}.mdx`), transformMdx(mdx));
      // `index` is the folder page; fumadocs doesn't want it in `pages`.
      if (clean !== "index") {
        pages.push(clean);
      }
    } else {
      // Copy non-MDX assets verbatim.
      cpSync(srcPath, join(outDir, entry.name));
    }
  }

  const meta = { pages };
  if (folderTitle) {
    meta.title = folderTitle;
  }
  if (defaultOpen === false) {
    meta.defaultOpen = false;
  }
  writeFileSync(join(outDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
};
