import { LogoIconAnthropicSvg } from '@vercel/geistdocs/assets/logos/logo-icon-anthropic-svg';
import { LogoIconDeepseekSvg } from '@vercel/geistdocs/assets/logos/logo-icon-deepseek-svg';
import { LogoIconElevenlabsSvg } from '@vercel/geistdocs/assets/logos/logo-icon-elevenlabs-svg';
import { LogoIconGoogleSvg } from '@vercel/geistdocs/assets/logos/logo-icon-google-svg';
import { LogoIconGrokSvg } from '@vercel/geistdocs/assets/logos/logo-icon-grok-svg';
import { LogoIconMetaSvg } from '@vercel/geistdocs/assets/logos/logo-icon-meta-svg';
import { LogoIconMistralSvg } from '@vercel/geistdocs/assets/logos/logo-icon-mistral-svg';
import { LogoIconMoonshotSvg } from '@vercel/geistdocs/assets/logos/logo-icon-moonshot-svg';
import { LogoIconOpenAiSvg } from '@vercel/geistdocs/assets/logos/logo-icon-open-ai-svg';
import { LogoIconPerplexitySvg } from '@vercel/geistdocs/assets/logos/logo-icon-perplexity-svg';
import { LogoIconZaiSvg } from '@vercel/geistdocs/assets/logos/logo-icon-zai-svg';
import { cn } from '@vercel/geistdocs/utils';
import type { Provider } from '@/lib/home/code-examples';

const LOGOS: Record<Provider, typeof LogoIconGrokSvg> = {
  grok: LogoIconGrokSvg,
  openai: LogoIconOpenAiSvg,
  anthropic: LogoIconAnthropicSvg,
  google: LogoIconGoogleSvg,
  mistral: LogoIconMistralSvg,
  meta: LogoIconMetaSvg,
  perplexity: LogoIconPerplexitySvg,
  deepseek: LogoIconDeepseekSvg,
  moonshot: LogoIconMoonshotSvg,
  zai: LogoIconZaiSvg,
  elevenlabs: LogoIconElevenlabsSvg,
};

export function ProviderLogo({
  provider,
  muted = false,
  className,
}: {
  provider: Provider;
  muted?: boolean;
  className?: string;
}) {
  const Logo = LOGOS[provider];
  return (
    <Logo
      aria-hidden="true"
      className={cn(muted ? 'text-gray-900' : 'text-gray-1000', className)}
      size={16}
    />
  );
}
