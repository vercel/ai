'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { RecipeItem } from '@/lib/recipes';
import { Badge } from './badge';

const ENVIRONMENT_TAGS = ['next', 'node', 'rsc', 'api servers'];

const getFullNameFromTag = (tag: string) => {
  switch (tag) {
    case 'next':
      return 'Next.js';
    case 'node':
      return 'Node.js';
    case 'rsc':
      return 'React Server Components';
    case 'api servers':
      return 'API Servers';
    default:
      return tag;
  }
};

const getTagsByCount = (items: RecipeItem[], selectedEnvironment: string) => {
  const tagCount = new Map<string, number>();

  for (const item of items) {
    if (!item.tags.includes(selectedEnvironment)) {
      continue;
    }
    for (const tag of item.tags) {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    }
  }

  return Array.from(tagCount.entries())
    .sort((a, b) => {
      const aIndex = ENVIRONMENT_TAGS.indexOf(a[0]);
      const bIndex = ENVIRONMENT_TAGS.indexOf(b[0]);

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) {
        return -1;
      }
      if (bIndex !== -1) {
        return 1;
      }
      return b[1] - a[1];
    })
    .map(([name, count]) => ({ name, count }));
};

/**
 * Filterable recipe list on the /resources/recipes landing page (ported
 * from the legacy ai-sdk.dev CookbookList component).
 */
export const RecipeList = ({
  items,
  versionPrefix = '',
}: {
  items: RecipeItem[];
  versionPrefix?: string;
}) => {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState('next');

  const tagsByCount = getTagsByCount(items, selectedEnvironment);

  const projectedItems = useMemo(() => {
    const selectedTagsWithEnvironment = [selectedEnvironment, ...selectedTags];

    return items
      .filter(item =>
        selectedTagsWithEnvironment.every(selectedTag =>
          item.tags.includes(selectedTag),
        ),
      )
      .sort((a, b) => {
        if (a.isNew && !b.isNew) {
          return -1;
        }
        if (!a.isNew && b.isNew) {
          return 1;
        }
        return a.order - b.order;
      });
  }, [items, selectedTags, selectedEnvironment]);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-semibold text-2xl">Recipes</h2>

      <div className="flex flex-row flex-wrap items-center gap-2">
        <div className="relative">
          <Badge className="normal-case" size="lg" variant="blue">
            <span className="min-w-10">
              {getFullNameFromTag(selectedEnvironment)}
            </span>
            <ChevronDown className="size-4 opacity-50" />
          </Badge>

          <select
            aria-label="Select environment"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={event => setSelectedEnvironment(event.target.value)}
            value={selectedEnvironment}
          >
            {ENVIRONMENT_TAGS.map(environment => (
              <option key={environment} value={environment}>
                {getFullNameFromTag(environment)}
              </option>
            ))}
          </select>
        </div>

        <div className="h-4 w-px bg-gray-alpha-400" />

        {tagsByCount
          .filter(tag => !ENVIRONMENT_TAGS.includes(tag.name))
          .map(tag => (
            <button
              className="cursor-pointer"
              key={tag.name}
              onClick={() =>
                setSelectedTags(current =>
                  current.includes(tag.name)
                    ? current.filter(selectedTag => selectedTag !== tag.name)
                    : [...current, tag.name],
                )
              }
              type="button"
            >
              <Badge
                size="lg"
                variant={
                  selectedTags.includes(tag.name) ? 'blue' : 'gray-subtle'
                }
              >
                {tag.name} <span className="opacity-50">{tag.count}</span>
              </Badge>
            </button>
          ))}
      </div>

      <div className="flex min-h-dvh flex-col pb-12">
        {projectedItems.length > 0 ? (
          projectedItems.map(item => (
            <Link
              className="group flex flex-row items-start justify-between border-gray-alpha-400 border-b py-2 md:items-center"
              href={`${versionPrefix}/resources/recipes/${item.path}`}
              key={item.path}
            >
              <div className="flex flex-row items-start gap-2 md:items-center">
                <div className="group-hover:underline">{item.title}</div>
                {item.isNew ? (
                  <Badge className="mr-2 md:mr-0" variant="amber-subtle">
                    New
                  </Badge>
                ) : null}
              </div>

              <div className="flex flex-row gap-2">
                {item.tags
                  .filter(tag => !ENVIRONMENT_TAGS.includes(tag))
                  .slice(0, 2)
                  .map(tag => (
                    <Badge key={tag} variant="gray-subtle">
                      {tag}
                    </Badge>
                  ))}
              </div>
            </Link>
          ))
        ) : (
          <div className="flex h-dvh flex-col">
            <div className="py-4 text-gray-900">
              No examples found for the selected tags.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
