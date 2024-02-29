import Link from 'next/link';

import {
  IconGitHub,
  IconSeparator,
  IconSparkles,
  IconVercel,
} from '@/components/ui/icons';
import { Button } from '@/components/ui/button';

export async function Header() {
  return (
    <header className="sticky top-0 z-50 flex h-14 w-full shrink-0 items-center justify-between border-b bg-background px-4 backdrop-blur-xl">
      <span className="inline-flex items-center home-links whitespace-nowrap">
        <a href="https://vercel.com" rel="noopener" target="_blank">
          <IconVercel className="w-5 h-5 sm:h-6 sm:w-6" />
        </a>
        <IconSeparator className="h-6 w-6 text-muted-foreground/20" />
        <Link href="/">
          <span className="font-bold text-lg">
            <IconSparkles className="inline mr-0 w-4 sm:w-5 mb-0.5" />
            AI
          </span>
        </Link>
      </span>
      <div className="flex items-center justify-end space-x-2">
        <Button variant="outline" asChild>
          <a
            target="_blank"
            href="https://github.com/vercel/ai-rsc-demo"
            rel="noopener noreferrer"
          >
            <IconGitHub />
            <span className="ml-2 hidden md:flex">GitHub</span>
          </a>
        </Button>
        <Button asChild>
          <a
            href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai-rsc-demo"
            target="_blank"
          >
            <IconVercel className="mr-2" />
            <span className="hidden sm:block">Deploy to Vercel</span>
            <span className="sm:hidden">Deploy</span>
          </a>
        </Button>
      </div>
    </header>
  );
}
