import Link from 'next/link';
import { getRecipes } from '@/lib/recipes';
import { Guides } from './guides';
import { RecipeList } from './recipe-list';

/**
 * The /resources/recipes landing page (ported from the legacy ai-sdk.dev
 * RecipesPage): featured guides, a filterable recipe list, and a
 * contribution call-out.
 */
export const RecipesLanding = ({
  version,
  versionPrefix,
}: {
  version: 'v7' | 'v6' | 'v5';
  versionPrefix: string;
}) => {
  const items = getRecipes(version);

  return (
    <main className="mx-auto flex w-full flex-col gap-10 p-4 pb-16 md:px-6 lg:w-[800px]">
      <div className="flex flex-col gap-2 pt-12">
        <div className="text-gray-900 text-sm">
          <Link className="hover:underline" href="/resources">
            Resources
          </Link>{' '}
          / Recipes
        </div>
        <h1 className="font-semibold text-4xl text-gray-1000">Recipes</h1>
        <p className="text-gray-900 text-xl">
          Build specific AI SDK features with open-source recipes from Vercel
          and the community.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between">
          <h2 className="font-semibold text-2xl text-gray-1000">Guides</h2>
          <Link
            className="hover:underline"
            href={`${versionPrefix}/resources/recipes/guides`}
          >
            View all
          </Link>
        </div>
        <Guides versionPrefix={versionPrefix} />
      </div>

      <RecipeList items={items} versionPrefix={versionPrefix} />

      <div className="rounded-xl border border-gray-alpha-400 p-6">
        <h2 className="font-semibold text-2xl text-gray-1000">
          Contribute a recipe
        </h2>
        <p className="mt-2 text-gray-900 leading-7">
          Recipes use the same MDX format as the current cookbook, with
          frontmatter for metadata such as title, description, tags, source,
          author, maintainer, and verification date.
        </p>
        <Link
          className="mt-4 inline-flex rounded-lg border border-gray-alpha-400 px-4 py-2 font-medium text-gray-1000 hover:border-gray-500"
          href="https://github.com/vercel/ai"
          rel="noopener noreferrer"
          target="_blank"
        >
          Contribute on GitHub
        </Link>
      </div>
    </main>
  );
};
