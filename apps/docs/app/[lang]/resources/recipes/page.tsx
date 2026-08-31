import type { Metadata } from 'next';
import { socialCard } from '@/lib/og';
import { RecipesLanding } from '@/components/recipes/recipes-landing';

export const metadata: Metadata = {
  title: 'AI SDK Recipes',
  description:
    'Open-source recipes, guides, and examples for building with the AI SDK.',
  ...socialCard(
    'AI SDK Recipes',
    'Open-source recipes, guides, and examples for building with the AI SDK.',
  ),
};

const Page = () => <RecipesLanding version="v7" versionPrefix="" />;

export default Page;
