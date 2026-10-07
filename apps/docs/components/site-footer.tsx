import {
  Github,
  Instagram,
  Linkedin,
  Youtube,
} from 'lucide-react';

const resources = [
  { label: 'Documentation', href: '/docs' },
  { label: 'Cookbook', href: '/cookbook' },
  { label: 'Providers', href: '/providers' },
  { label: 'Playground', href: 'https://playground.ai-sdk.dev' },
];

const community = [
  { label: 'GitHub repository', href: 'https://github.com/vercel/ai' },
  { label: 'Discussions', href: 'https://github.com/vercel/ai/discussions' },
  {
    label: 'Contributing guide',
    href: 'https://github.com/vercel/ai/blob/main/CONTRIBUTING.md',
  },
  { label: 'Changelog', href: 'https://github.com/vercel/ai/releases' },
];

const legal = [
  {
    label: 'License',
    href: 'https://github.com/vercel/ai/blob/main/LICENSE',
  },
  { label: 'Privacy', href: 'https://vercel.com/legal/privacy-policy' },
  { label: 'Terms', href: 'https://vercel.com/legal/terms' },
];

const social = [
  {
    label: 'GitHub',
    href: 'https://github.com/vercel/ai',
    Icon: Github,
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/vercelhq/',
    Icon: Instagram,
  },
  {
    label: 'LinkedIn',
    href: 'https://linkedin.com/company/vercel',
    Icon: Linkedin,
  },
  {
    label: 'YouTube',
    href: 'https://youtube.com/@VercelHQ',
    Icon: Youtube,
  },
];

const FooterLink = ({
  href,
  label,
}: {
  href: string;
  label: string;
}) => (
  <li>
    <a
      className="text-gray-900 text-sm transition-colors hover:text-gray-1000 hover:underline"
      href={href}
      rel={href.startsWith('http') ? 'noreferrer' : undefined}
      target={href.startsWith('http') ? '_blank' : undefined}
    >
      {label}
    </a>
  </li>
);

const FooterSection = ({
  heading,
  links,
}: {
  heading: string;
  links: Array<{ label: string; href: string }>;
}) => (
  <div>
    <h2 className="mb-4 text-gray-1000 text-sm font-medium">{heading}</h2>
    <ul className="flex flex-col gap-3">
      {links.map((link) => (
        <FooterLink key={link.href} {...link} />
      ))}
    </ul>
  </div>
);

export const SiteFooter = () => (
  <footer className="border-gray-alpha-400 border-t bg-background-200">
    <div className="mx-auto grid w-full max-w-[1448px] gap-12 px-6 py-14 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] lg:px-8">
      <div className="max-w-sm">
        <a
          className="font-semibold text-gray-1000 text-lg tracking-tight"
          href="/"
        >
          AI SDK
        </a>
        <p className="mt-4 text-gray-900 text-sm leading-6">
          The TypeScript toolkit for building AI applications and agents.
          Built in the open by Vercel and the community.
        </p>
        <div className="mt-6 flex items-center gap-2">
          {social.map(({ Icon, href, label }) => (
            <a
              aria-label={label}
              className="inline-flex size-9 items-center justify-center rounded-md text-gray-900 transition-colors hover:bg-gray-alpha-200 hover:text-gray-1000"
              href={href}
              key={label}
              rel="noreferrer"
              target="_blank"
            >
              <Icon aria-hidden="true" className="size-4" />
            </a>
          ))}
        </div>
      </div>

      <FooterSection heading="Resources" links={resources} />
      <FooterSection heading="Community" links={community} />
      <FooterSection heading="Legal" links={legal} />
    </div>

    <div className="border-gray-alpha-400 border-t">
      <div className="mx-auto flex w-full max-w-[1448px] flex-col gap-2 px-6 py-5 text-gray-900 text-xs sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <p>© {new Date().getFullYear()} Vercel Inc. All rights reserved.</p>
        <p>
          AI SDK is open source and available under the{' '}
          <a
            className="text-gray-1000 underline underline-offset-2 hover:no-underline"
            href="https://github.com/vercel/ai/blob/main/LICENSE"
            rel="noreferrer"
            target="_blank"
          >
            Apache 2.0 license
          </a>
          .
        </p>
      </div>
    </div>
  </footer>
);
