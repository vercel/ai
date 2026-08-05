import { createVersionedSources } from '@vercel/geistdocs/source';
import {
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

export const v5Source = versions.byId.v5;
export const v6Source = versions.byId.v6;
export const v7Source = versions.byId.v7;
export const providersV5Source = providerVersions.byId.v5;
export const providersV6Source = providerVersions.byId.v6;
export const providersV7Source = providerVersions.byId.v7;

/** Sources for a version across every content family. */
export const v5Sources = [v5Source, providersV5Source];
export const v6Sources = [v6Source, providersV6Source];
export const v7Sources = [v7Source, providersV7Source];

/** Every source bundle (all versions, all families). */
export const sources = [...v7Sources, ...v6Sources, ...v5Sources];
