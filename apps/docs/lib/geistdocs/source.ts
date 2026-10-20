import { createVersionedSources } from '@vercel/geistdocs/source';
import {
  cookbookV5,
  cookbookV6,
  cookbookV7,
  docsV5,
  docsV6,
  docsV7,
  providersV5,
  providersV6,
  providersV7,
} from '@/.source/server';
import { config } from './config';

export const versions = createVersionedSources({
  config,
  current: 'v7',
  versions: [
    {
      id: 'v7',
      label: 'v7',
      docs: docsV7,
      baseUrl: '/docs',
      routePrefix: '',
    },
    {
      id: 'v6',
      label: 'v6',
      docs: docsV6,
      baseUrl: '/v6/docs',
      routePrefix: '/v6',
    },
    {
      id: 'v5',
      label: 'v5',
      docs: docsV5,
      baseUrl: '/v5/docs',
      routePrefix: '/v5',
    },
  ],
});

export const providerVersions = createVersionedSources({
  config,
  current: 'v7',
  versions: [
    {
      id: 'v7',
      label: 'v7',
      docs: providersV7,
      baseUrl: '/providers',
      routePrefix: '',
    },
    {
      id: 'v6',
      label: 'v6',
      docs: providersV6,
      baseUrl: '/v6/providers',
      routePrefix: '/v6',
    },
    {
      id: 'v5',
      label: 'v5',
      docs: providersV5,
      baseUrl: '/v5/providers',
      routePrefix: '/v5',
    },
  ],
});

export const cookbookVersions = createVersionedSources({
  config,
  current: 'v7',
  versions: [
    {
      id: 'v7',
      label: 'v7',
      docs: cookbookV7,
      baseUrl: '/cookbook',
      routePrefix: '',
    },
    {
      id: 'v6',
      label: 'v6',
      docs: cookbookV6,
      baseUrl: '/v6/cookbook',
      routePrefix: '/v6',
    },
    {
      id: 'v5',
      label: 'v5',
      docs: cookbookV5,
      baseUrl: '/v5/cookbook',
      routePrefix: '/v5',
    },
  ],
});

/**
 * The same cookbook content served under /resources/recipes, mirroring
 * production: ai-sdk.dev renders every recipe on both URL surfaces (the
 * sitemap and agent surfaces canonicalize on /cookbook).
 */
export const recipesVersions = createVersionedSources({
  config,
  current: 'v7',
  versions: [
    {
      id: 'v7',
      label: 'v7',
      docs: cookbookV7,
      baseUrl: '/resources/recipes',
      routePrefix: '',
    },
    {
      id: 'v6',
      label: 'v6',
      docs: cookbookV6,
      baseUrl: '/v6/resources/recipes',
      routePrefix: '/v6',
    },
    {
      id: 'v5',
      label: 'v5',
      docs: cookbookV5,
      baseUrl: '/v5/resources/recipes',
      routePrefix: '/v5',
    },
  ],
});

export const v5Source = versions.byId.v5;
export const v6Source = versions.byId.v6;
export const v7Source = versions.byId.v7;
export const providersV5Source = providerVersions.byId.v5;
export const providersV6Source = providerVersions.byId.v6;
export const providersV7Source = providerVersions.byId.v7;
export const cookbookV5Source = cookbookVersions.byId.v5;
export const cookbookV6Source = cookbookVersions.byId.v6;
export const cookbookV7Source = cookbookVersions.byId.v7;
export const recipesV5Source = recipesVersions.byId.v5;
export const recipesV6Source = recipesVersions.byId.v6;
export const recipesV7Source = recipesVersions.byId.v7;

/**
 * Sources for a version across every content family. The /resources/recipes
 * bundles are intentionally excluded: production canonicalizes the sitemap,
 * llms.txt, and search on the /cookbook URLs.
 */
export const v5Sources = [v5Source, providersV5Source, cookbookV5Source];
export const v6Sources = [v6Source, providersV6Source, cookbookV6Source];
export const v7Sources = [v7Source, providersV7Source, cookbookV7Source];

/** Every source bundle (all versions, all families). */
export const sources = [...v7Sources, ...v6Sources, ...v5Sources];
