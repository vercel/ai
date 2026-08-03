import { createVersionedSources } from '@vercel/geistdocs/source';
import { docsV6, docsV7, providersV6, providersV7 } from '@/.source/server';
import { config } from './config';

export const versions = createVersionedSources({
  config,
  current: 'v6',
  versions: [
    {
      id: 'v6',
      label: 'v6',
      docs: docsV6,
      baseUrl: '/docs',
      routePrefix: '',
    },
    {
      id: 'v7',
      label: 'v7',
      docs: docsV7,
      baseUrl: '/v7/docs',
      routePrefix: '/v7',
    },
  ],
});

export const providerVersions = createVersionedSources({
  config,
  current: 'v6',
  versions: [
    {
      id: 'v6',
      label: 'v6',
      docs: providersV6,
      baseUrl: '/providers',
      routePrefix: '',
    },
    {
      id: 'v7',
      label: 'v7',
      docs: providersV7,
      baseUrl: '/v7/providers',
      routePrefix: '/v7',
    },
  ],
});

export const v6Source = versions.byId.v6;
export const v7Source = versions.byId.v7;
export const providersV6Source = providerVersions.byId.v6;
export const providersV7Source = providerVersions.byId.v7;

/** Sources for a version across every content family. */
export const v6Sources = [v6Source, providersV6Source];
export const v7Sources = [v7Source, providersV7Source];

/** Every source bundle (all versions, all families). */
export const sources = [...v6Sources, ...v7Sources];
