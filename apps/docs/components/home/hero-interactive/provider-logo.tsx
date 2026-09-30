import { cn } from '@vercel/geistdocs/utils';
import { PROVIDERS, type Provider } from '@/lib/home/code-examples';

export function ProviderLogo({
  provider,
  muted = false,
  className,
}: {
  provider: Provider;
  muted?: boolean;
  className?: string;
}) {
  const logo = PROVIDERS.find(item => item.id === provider)!;
  return (
    <img
      alt=""
      className={cn(
        'size-4',
        'invert' in logo && logo.invert && 'dark:invert',
        muted && 'opacity-60 grayscale',
        className,
      )}
      height={16}
      src={`/images/icons/${logo.logo}`}
      width={16}
    />
  );
}
