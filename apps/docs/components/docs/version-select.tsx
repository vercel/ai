'use client';

import type { GeistdocsVersionConfig } from '@vercel/geistdocs/config';
import { GeistdocsRouteSelect } from '@vercel/geistdocs/versions';
import { usePathname } from 'next/navigation';

/** Version glyph from the production ai-sdk.dev version switcher. */
const VersionGlyph = () => (
  <svg
    aria-hidden
    height="16"
    strokeLinejoin="round"
    style={{ color: 'currentcolor' }}
    viewBox="0 0 16 16"
    width="16"
  >
    <path
      clipRule="evenodd"
      d="M1 1.5H1.75H14.25H15V2.25V6.25V7H14.25H8.75V14.25V15H7.25V14.25V7H1.75H1V6.25V2.25V1.5ZM2.5 5.5V3H13.5V5.5H2.5Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

export const VersionSelect = ({
  current,
  missingPaths,
  versions,
}: {
  current: string;
  missingPaths: Record<string, string[]>;
  versions: GeistdocsVersionConfig[];
}) => {
  const pathname = usePathname();
  const currentVersion = versions.find(version => version.id === current);
  const currentPrefix = currentVersion?.routePrefix ?? '';
  // The unprefixed version is the latest; production colors it blue and
  // maintenance versions gray.
  const latestId = versions.find(version => !version.routePrefix)?.id;
  const unversionedPath = pathname.startsWith(currentPrefix)
    ? pathname.slice(currentPrefix.length) || '/'
    : pathname;
  const items = versions.map(version => {
    const prefix = version.routePrefix ?? '';
    const targetPath = `${prefix}${unversionedPath}`;
    const fallbackPath = `${prefix}/docs/introduction`;

    return {
      ...version,
      href: missingPaths[version.id]?.includes(unversionedPath)
        ? fallbackPath
        : targetPath,
      routePrefix: undefined,
    };
  });

  return (
    <GeistdocsRouteSelect
      ariaLabel="Select documentation version"
      current={current}
      getDescription={({ item }) => item.description}
      items={items}
      renderIcon={({ item }) => (
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-md border ${
            item.id === latestId
              ? 'border-blue-400 bg-blue-100 text-blue-700'
              : 'border-gray-300 bg-gray-200 text-gray-900'
          }`}
        >
          <VersionGlyph />
        </span>
      )}
    />
  );
};
