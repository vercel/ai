import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One cookbook recipe row on the /resources/recipes landing page. */
export interface RecipeItem {
  title: string;
  /** Family-relative path, e.g. `next/generate-text`. */
  path: string;
  tags: string[];
  isNew: boolean;
  /**
   * Global sort order: section-major, then the section's meta.json order.
   * Matches the legacy app's numeric-prefix ordering for every filter view.
   */
  order: number;
}

const frontmatterOf = (mdx: string) =>
  mdx.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';

const titleOf = (frontmatter: string) =>
  frontmatter
    .match(/^title:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^(['"])(.*)\1$/, '$2');

/** Parses inline and multiline YAML flow arrays: `tags: ['a', 'b']`. */
const tagsOf = (frontmatter: string) => {
  const list = frontmatter.match(/^tags:\s*\r?\n?\s*\[([\s\S]*?)\]/m)?.[1];
  if (!list) {
    return [];
  }
  return [...list.matchAll(/'([^']*)'|"([^"]*)"/g)].map(
    match => match[1] ?? match[2],
  );
};

const readMeta = (dir: string): { pages: string[] } =>
  JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as {
    pages: string[];
  };

const cache = new Map<string, RecipeItem[]>();

/**
 * Flattened, ordered cookbook recipes for one synced content version, read
 * from the generated `content/<version>/cookbook` directory at build time.
 */
export const getRecipes = (version: 'v7' | 'v6' | 'v5'): RecipeItem[] => {
  const cached = cache.get(version);
  if (cached) {
    return cached;
  }

  const familyDir = join(process.cwd(), 'content', version, 'cookbook');
  const items: RecipeItem[] = [];

  readMeta(familyDir).pages.forEach((section, sectionIndex) => {
    const sectionDir = join(familyDir, section);
    if (!existsSync(join(sectionDir, 'meta.json'))) {
      return;
    }
    readMeta(sectionDir).pages.forEach((slug, pageIndex) => {
      const file = join(sectionDir, `${slug}.mdx`);
      if (!existsSync(file)) {
        return;
      }
      const frontmatter = frontmatterOf(readFileSync(file, 'utf8'));
      items.push({
        title: titleOf(frontmatter) ?? slug,
        path: `${section}/${slug}`,
        tags: tagsOf(frontmatter),
        isNew: /^new:\s*true/m.test(frontmatter),
        order: sectionIndex * 1000 + pageIndex,
      });
    });
  });

  cache.set(version, items);
  return items;
};
