'use client';

import {
  IconChevronDownSmall,
  IconWrench,
} from '@vercel/geistdocs/assets/icons';
import { IconArrowUpRight } from '@vercel/geistdocs/assets/icons/icon-arrow-up-right';
import { LogoIconVercel } from '@vercel/geistdocs/assets/logos';
import { CodeBlock } from '@vercel/geistdocs/components/code-block';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@vercel/geistdocs/components/dropdown-menu';
import { geistShikiTheme } from '@vercel/geistdocs/shiki-theme';
import Link from 'next/link';
import type { HighlighterCore as ShikiHighlighter } from 'shiki/core';
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ResolveHref } from '@/components/docs/resolve-href';

/**
 * Faithful port of production ai-sdk.dev's InteractiveCodePreview
 * (legacy `apps/studio/components/docs/interactive-code-preview.tsx`),
 * adapted to Geistdocs primitives:
 * - `@vercel/geist` CodeBlock -> Geistdocs CodeBlock + client-side shiki
 * - geist Tabs -> local accessible tablist
 * - cmdk Command + Popover -> Geistdocs DropdownMenu
 * - swr -> plain `fetch` in an effect (no new dependencies)
 */

type TabType = 'gateway' | 'provider' | 'custom';
type ModelKind = 'text' | 'image' | 'video';

const cx = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(' ');

const identityHref: ResolveHref = href => href;

const STORAGE_KEY = 'ai-sdk-code-preview';

const GATEWAY_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';

const TAB_TYPES: TabType[] = ['gateway', 'provider', 'custom'];

const DEFAULT_MODEL_IDS: Record<ModelKind, string> = {
  text: 'anthropic/claude-sonnet-4.5',
  image: 'openai/gpt-image-1',
  video: 'google/veo-3.1-generate-001',
};

const MODEL_KIND_PLACEHOLDERS: Record<ModelKind, string[]> = {
  text: ['__TEXT_MODEL__', '__MODEL__'],
  image: ['__IMAGE_MODEL__'],
  video: ['__VIDEO_MODEL__'],
};

const MODEL_KIND_GATEWAY_TYPES: Record<ModelKind, string> = {
  text: 'language',
  image: 'image',
  video: 'video',
};

const MODEL_KIND_FACTORY_SUFFIX: Record<ModelKind, string> = {
  text: '',
  image: '.image',
  video: '.video',
};

const MODEL_KINDS = Object.keys(MODEL_KIND_PLACEHOLDERS) as ModelKind[];

type PersistedStorageState = {
  modelId?: string;
  modelIds?: Partial<Record<ModelKind, string>>;
  tab?: TabType;
};

type StorageState = {
  modelIds: Record<ModelKind, string>;
  tab: TabType;
};

const EXCLUDED_MODEL_IDS = [
  'openai/gpt-oss-safeguard-20b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

const safeLocalStorage = {
  getItem: (): PersistedStorageState | null => {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      const item = localStorage.getItem(STORAGE_KEY);
      return item ? (JSON.parse(item) as PersistedStorageState) : null;
    } catch {
      return null;
    }
  },
  setItem: (state: StorageState): void => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // Dispatch storage event so other instances on the page stay in sync
      // (the native event only fires in other tabs).
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: JSON.stringify(state),
        }),
      );
    } catch {
      // Storage unavailable (private mode, quota); selection stays in memory.
    }
  },
};

const getDefaultModelIds = (
  defaultTextModelId: string,
): Record<ModelKind, string> => ({
  ...DEFAULT_MODEL_IDS,
  text: defaultTextModelId,
});

const getStorageState = (
  state: PersistedStorageState | null,
  defaultTextModelId: string,
): StorageState | null => {
  if (!(state?.tab && TAB_TYPES.includes(state.tab))) {
    return null;
  }

  return {
    tab: state.tab,
    modelIds: {
      ...getDefaultModelIds(defaultTextModelId),
      ...state.modelIds,
      ...(state.modelId ? { text: state.modelId } : {}),
    },
  };
};

type ModelOption = {
  id: string;
  kind: ModelKind;
  name: string;
  provider: string;
  providerTitle: string;
  code: string;
  icon: ReactNode;
  created: number;
};

type GatewayModel = {
  id: string;
  owned_by: string;
  name: string;
  type: string;
  created: number;
};

type GatewayResponse = {
  data: GatewayModel[];
};

/**
 * Static provider marks under `public/images/icons`. Monochrome marks are
 * inverted in dark mode (same convention as `model-cards.tsx`). Providers
 * without an asset fall back to the generic "custom" mark.
 */
const PROVIDER_LOGOS: Record<string, { src: string; invert?: boolean }> = {
  amazon: { src: '/images/icons/aws.svg' },
  anthropic: { src: '/images/icons/anthropic.svg', invert: true },
  cohere: { src: '/images/icons/cohere.svg' },
  deepseek: { src: '/images/icons/deepseek.svg' },
  google: { src: '/images/icons/google.svg' },
  groq: { src: '/images/icons/groq.svg' },
  mistral: { src: '/images/icons/mistral.svg' },
  openai: { src: '/images/icons/openai.svg', invert: true },
  perplexity: { src: '/images/icons/perplexity.svg' },
  vercel: { src: '/images/icons/vercel.svg', invert: true },
  xai: { src: '/images/icons/xai-black.svg', invert: true },
};

const FALLBACK_PROVIDER_LOGO = {
  src: '/images/icons/custom.svg',
  invert: true,
};

const ProviderLogo = ({ provider }: { provider: string }) => {
  const logo = PROVIDER_LOGOS[provider] ?? FALLBACK_PROVIDER_LOGO;
  return (
    // Static brand SVGs skip the Next image optimizer deliberately.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className={cx('size-4', logo.invert && 'dark:invert')}
      height={16}
      src={logo.src}
      width={16}
    />
  );
};

// Human-readable names for providers (ported verbatim from the legacy app).
const providerTitles: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  xai: 'xAI',
  mistral: 'Mistral',
  alibaba: 'Alibaba',
  amazon: 'Amazon',
  bfl: 'Black Forest Labs',
  cohere: 'Cohere',
  deepseek: 'DeepSeek',
  inception: 'Inception',
  meituan: 'Meituan',
  meta: 'Meta',
  minimax: 'MiniMax',
  moonshotai: 'Moonshot AI',
  morph: 'Morph',
  perplexity: 'Perplexity',
  stealth: 'Stealth',
  vercel: 'Vercel',
  zai: 'Z.AI',
};

// Top providers to show first (in order)
const TOP_PROVIDERS = ['openai', 'anthropic', 'google'];

// Preferred default model per provider (overrides default ranking when
// selecting a provider)
const providerPreferredModels: Partial<
  Record<ModelKind, Record<string, string>>
> = {
  text: {
    google: 'google/gemini-3-pro-preview',
  },
  image: {
    openai: 'openai/gpt-image-1',
    xai: 'xai/grok-imagine-image-pro',
  },
  video: {
    google: 'google/veo-3.1-generate-001',
    xai: 'xai/grok-imagine-video',
  },
};

// First-party providers with official AI SDK packages
export const FIRST_PARTY_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'mistral',
  'groq',
  'deepseek',
  'perplexity',
  'cohere',
  'amazon',
  'vercel',
];

const MODEL_KIND_PROVIDER_ALLOWLISTS: Record<ModelKind, string[]> = {
  text: FIRST_PARTY_PROVIDERS,
  image: ['openai', 'google', 'xai'],
  video: ['google', 'xai'],
};

// Mapping for providers where SDK package/export differs from gateway
// provider ID: { gatewayId: { pkg: 'package-name', export: 'exportName' } }
const providerSdkMap: Record<string, { pkg: string; export: string }> = {
  amazon: { pkg: 'amazon-bedrock', export: 'bedrock' },
};

// Mapping for models where the provider SDK model code differs from the
// gateway model code
const providerModelCodeOverrides: Record<string, string> = {
  'google/gemini-3-pro-image': 'gemini-3-pro-image-preview',
};

const getModelKindForGatewayType = (type: string): ModelKind | null => {
  switch (type) {
    case MODEL_KIND_GATEWAY_TYPES.text:
      return 'text';
    case MODEL_KIND_GATEWAY_TYPES.image:
      return 'image';
    case MODEL_KIND_GATEWAY_TYPES.video:
      return 'video';
    default:
      return null;
  }
};

const getPlaceholderKinds = (code: string): ModelKind[] => {
  const kinds = MODEL_KINDS.filter(kind =>
    MODEL_KIND_PLACEHOLDERS[kind].some(placeholder =>
      code.includes(placeholder),
    ),
  );

  return kinds.length > 0 ? kinds : ['text'];
};

const getDefaultModelOption = (kind: ModelKind): ModelOption => {
  const provider =
    kind === 'image' ? 'openai' : kind === 'video' ? 'google' : 'anthropic';
  return {
    id: DEFAULT_MODEL_IDS[kind],
    kind,
    name:
      kind === 'image'
        ? 'GPT Image 1'
        : kind === 'video'
          ? 'Veo 3.1'
          : 'Claude Sonnet 4.5',
    provider,
    providerTitle: providerTitles[provider] ?? provider,
    code: DEFAULT_MODEL_IDS[kind].split('/')[1] || DEFAULT_MODEL_IDS[kind],
    icon: <ProviderLogo provider={provider} />,
    created: 0,
  };
};

// Parse API response into model options grouped by provider
function parseModels(data: GatewayResponse | null): ModelOption[] {
  if (!data?.data || !Array.isArray(data.data)) {
    return [];
  }

  const models: ModelOption[] = [];

  for (const model of data.data) {
    const kind = getModelKindForGatewayType(model.type);
    if (!kind) {
      continue;
    }

    const code = model.id.split('/')[1] || model.id;
    models.push({
      id: model.id,
      kind,
      name: model.name,
      provider: model.owned_by,
      providerTitle: providerTitles[model.owned_by] || model.owned_by,
      code,
      icon: <ProviderLogo provider={model.owned_by} />,
      created: model.created,
    });
  }

  return models.sort((a, b) => {
    const aTopIndex = TOP_PROVIDERS.indexOf(a.provider);
    const bTopIndex = TOP_PROVIDERS.indexOf(b.provider);

    if (aTopIndex !== -1 && bTopIndex !== -1) {
      if (aTopIndex !== bTopIndex) {
        return aTopIndex - bTopIndex;
      }
      return b.name.localeCompare(a.name);
    }

    if (aTopIndex !== -1) {
      return -1;
    }
    if (bTopIndex !== -1) {
      return 1;
    }

    if (a.provider !== b.provider) {
      return a.provider.localeCompare(b.provider);
    }
    return b.name.localeCompare(a.name);
  });
}

/**
 * Lazy module-level shiki singleton. Uses the fine-grained core API with a
 * single grammar instead of the full `shiki` bundle: importing the bundle
 * puts all ~350 grammars into the client compile graph, which blows past
 * the Vercel build container's memory. The dynamic imports also keep the
 * highlighter out of the initial client bundle; the plain-text fallback
 * renders until it resolves.
 */
let highlighterPromise: Promise<ShikiHighlighter> | null = null;

const loadHighlighter = (): Promise<ShikiHighlighter> => {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] =
      await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
      ]);
    return createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      langs: [import('@shikijs/langs/typescript')],
      themes: [geistShikiTheme],
    });
  })();
  return highlighterPromise;
};

/**
 * Highlight code with the Geist css-variables shiki theme and return the
 * inner HTML of the generated `<code>` element (shiki `.line` spans, with
 * `highlighted` added to the requested 1-based lines). The Geistdocs
 * CodeBlock supplies the surrounding `<pre>`, mirroring the DOM shape the
 * MDX pipeline produces at build time.
 */
const highlightCode = async (
  code: string,
  highlightedLines: number[],
): Promise<string> => {
  const highlighter = await loadHighlighter();
  const html = highlighter.codeToHtml(code, {
    lang: 'typescript',
    theme: geistShikiTheme,
    transformers: [
      {
        line(node, line) {
          if (highlightedLines.includes(line)) {
            this.addClassToHast(node, 'highlighted');
          }
        },
      },
    ],
  });

  const codeTagStart = html.indexOf('<code');
  const contentStart = html.indexOf('>', codeTagStart) + 1;
  const contentEnd = html.lastIndexOf('</code>');
  if (codeTagStart === -1 || contentEnd === -1 || contentStart === 0) {
    return '';
  }
  return html.slice(contentStart, contentEnd);
};

function ModelDropdown({
  options,
  selected,
  onSelect,
  providers,
  onProviderSelect,
  showProviderOnly,
}: {
  options: ModelOption[];
  selected: ModelOption;
  onSelect: (option: ModelOption) => void;
  providers: { name: string; title: string; icon: ReactNode }[];
  onProviderSelect: (providerName: string) => void;
  showProviderOnly: string | null;
}) {
  const grouped = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {};
    for (const option of options) {
      if (!groups[option.provider]) {
        groups[option.provider] = [];
      }
      groups[option.provider].push(option);
    }
    return groups;
  }, [options]);

  const providerOrder = useMemo(() => {
    const providerNames = Object.keys(grouped);
    return providerNames.sort((a, b) => {
      const aTopIndex = TOP_PROVIDERS.indexOf(a);
      const bTopIndex = TOP_PROVIDERS.indexOf(b);
      if (aTopIndex !== -1 && bTopIndex !== -1) {
        return aTopIndex - bTopIndex;
      }
      if (aTopIndex !== -1) {
        return -1;
      }
      if (bTopIndex !== -1) {
        return 1;
      }
      return a.localeCompare(b);
    });
  }, [grouped]);

  const topProviders = providers.filter(provider =>
    TOP_PROVIDERS.includes(provider.name),
  );
  const otherProviders = providers.filter(
    provider => !TOP_PROVIDERS.includes(provider.name),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Select model"
          className="flex h-7 min-w-[160px] max-w-[220px] cursor-pointer select-none items-center justify-between gap-2 rounded-md border border-gray-alpha-400 bg-background-100 px-2.5 text-gray-1000 text-xs transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          type="button"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0">{selected.icon}</span>
            <span className="truncate">
              {showProviderOnly
                ? providerTitles[showProviderOnly] || showProviderOnly
                : selected.name}
            </span>
          </span>
          <IconChevronDownSmall className="shrink-0 text-gray-700" size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[min(300px,var(--radix-dropdown-menu-content-available-height))] w-[280px]"
      >
        <DropdownMenuLabel className="text-gray-900 text-xs">
          Model Creators
        </DropdownMenuLabel>
        {topProviders.map(provider => (
          <DropdownMenuItem
            className="cursor-pointer"
            key={`provider-${provider.name}`}
            onSelect={() => onProviderSelect(provider.name)}
          >
            <span className="flex items-center gap-2">
              <span className="shrink-0">{provider.icon}</span>
              <span>{provider.title}</span>
            </span>
          </DropdownMenuItem>
        ))}
        {otherProviders.map(provider => (
          <DropdownMenuItem
            className="inline-flex w-auto cursor-pointer px-1.5"
            key={`provider-${provider.name}`}
            onSelect={() => onProviderSelect(provider.name)}
            title={provider.title}
          >
            <span className="shrink-0">{provider.icon}</span>
          </DropdownMenuItem>
        ))}
        {providerOrder.map(provider => (
          <div key={provider}>
            <DropdownMenuLabel className="text-gray-900 text-xs">
              {`${providerTitles[provider] || provider} Models`}
            </DropdownMenuLabel>
            {(grouped[provider] ?? []).map(option => (
              <DropdownMenuItem
                className={cx(
                  'cursor-pointer',
                  selected.id === option.id && 'bg-gray-100',
                )}
                key={option.id}
                onSelect={() => onSelect(option)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0">{option.icon}</span>
                  <span className="truncate">{option.name}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CrosshairIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    aria-hidden
    fill="none"
    height={size}
    viewBox="0 0 16 16"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M8 0.5v3M8 12.5v3M0.5 8h3M12.5 8h3"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

const TABS: { id: TabType; title: string; icon: ReactNode }[] = [
  { id: 'gateway', title: 'Gateway', icon: <LogoIconVercel size={13} /> },
  { id: 'provider', title: 'Provider', icon: <CrosshairIcon size={14} /> },
  { id: 'custom', title: 'Custom', icon: <IconWrench size={14} /> },
];

type InteractiveCodePreviewProps = {
  /** Code template with __MODEL__, __TEXT_MODEL__, __IMAGE_MODEL__, __VIDEO_MODEL__, and __PROVIDER_IMPORT__ placeholders */
  code: string;
  language?: string;
  /** Lines to highlight for Gateway tab (no import line) */
  highlightedLines?: number[];
  /** Lines to highlight for Provider/Custom tabs (with import line). Falls back to highlightedLines if not specified. */
  highlightedLinesWithImport?: number[];
  className?: string;
  /** Default text model ID for backwards-compatible text snippets. */
  defaultModelId?: string;
  /** Provider IDs to show in the Provider tab. Intersected with the supported providers for the detected model kind. */
  allowedProviders?: string[];
  /** Model IDs to exclude from the Provider tab. */
  excludedModelIds?: string[];
  /** Callback when the model selection changes */
  onModelChange?: () => void;
  /** Resolves links that must retain the active documentation version. */
  resolveHref?: ResolveHref;
  /** Content to render below the code block */
  children?: ReactNode;
};

export const InteractiveCodePreview = ({
  code,
  language = 'typescript',
  highlightedLines,
  highlightedLinesWithImport,
  className,
  defaultModelId = DEFAULT_MODEL_IDS.text,
  allowedProviders,
  excludedModelIds = EXCLUDED_MODEL_IDS,
  onModelChange,
  resolveHref = identityHref,
  children,
}: InteractiveCodePreviewProps) => {
  const id = useId();
  const tabRefs = useRef<Partial<Record<TabType, HTMLButtonElement | null>>>(
    {},
  );

  const placeholderKinds = useMemo(() => getPlaceholderKinds(code), [code]);
  const activeModelKind = useMemo<ModelKind>(() => {
    if (placeholderKinds.includes('video')) {
      return 'video';
    }
    if (placeholderKinds.includes('image')) {
      return 'image';
    }
    return 'text';
  }, [placeholderKinds]);

  const [activeTab, setActiveTab] = useState<TabType>('gateway');
  const [selectedModelIds, setSelectedModelIds] = useState<
    Record<ModelKind, string>
  >(() => getDefaultModelIds(defaultModelId));
  const [showProviderOnly, setShowProviderOnly] = useState<string | null>(null);

  // Load saved state from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const saved = getStorageState(safeLocalStorage.getItem(), defaultModelId);
    if (saved) {
      setActiveTab(saved.tab);
      setSelectedModelIds(saved.modelIds);
    }
  }, [defaultModelId]);

  // Listen for changes from other instances via storage event
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) {
        return;
      }
      try {
        const saved = getStorageState(
          JSON.parse(event.newValue) as PersistedStorageState,
          defaultModelId,
        );
        if (!saved) {
          return;
        }

        setActiveTab(saved.tab);
        setSelectedModelIds(saved.modelIds);
        setShowProviderOnly(null);
      } catch {
        // Ignore invalid JSON
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [defaultModelId]);

  // Save and broadcast when selection changes
  const updateSelection = (
    modelIds: Record<ModelKind, string>,
    tab: TabType,
  ) => {
    safeLocalStorage.setItem({ modelIds, tab });
  };

  // Fetch the gateway model list client-side; fall back to the default
  // options when the request fails or is blocked.
  const [gatewayData, setGatewayData] = useState<GatewayResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(GATEWAY_MODELS_URL, {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        const json = (await response.json()) as GatewayResponse;
        if (!cancelled) {
          setGatewayData(json);
        }
      } catch {
        // Network failure or aborted: keep the DEFAULT_MODEL_IDS fallback.
      }
    };

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const allModels = useMemo(() => parseModels(gatewayData), [gatewayData]);
  const models =
    allModels.length > 0
      ? allModels
      : MODEL_KINDS.map(kind => getDefaultModelOption(kind));

  const gatewayTabModelsByKind = useMemo(
    () =>
      MODEL_KINDS.reduce(
        (acc, kind) => {
          acc[kind] = models.filter(model => model.kind === kind);
          return acc;
        },
        {} as Record<ModelKind, ModelOption[]>,
      ),
    [models],
  );

  const providerTabModelsByKind = useMemo(
    () =>
      MODEL_KINDS.reduce(
        (acc, kind) => {
          acc[kind] = gatewayTabModelsByKind[kind].filter(
            model =>
              MODEL_KIND_PROVIDER_ALLOWLISTS[kind].includes(model.provider) &&
              (!allowedProviders?.length ||
                allowedProviders.includes(model.provider)) &&
              (!excludedModelIds?.length ||
                !excludedModelIds.includes(model.id)),
          );
          return acc;
        },
        {} as Record<ModelKind, ModelOption[]>,
      ),
    [allowedProviders, excludedModelIds, gatewayTabModelsByKind],
  );

  const displayedModels =
    activeTab === 'provider'
      ? providerTabModelsByKind[activeModelKind]
      : gatewayTabModelsByKind[activeModelKind];

  const providers = useMemo(() => {
    const seen = new Set<string>();
    const result: { name: string; title: string; icon: ReactNode }[] = [];
    for (const model of displayedModels) {
      if (!seen.has(model.provider)) {
        seen.add(model.provider);
        result.push({
          name: model.provider,
          title: model.providerTitle,
          icon: model.icon,
        });
      }
    }
    return result;
  }, [displayedModels]);

  const selectedModelsByKind = useMemo(
    () =>
      MODEL_KINDS.reduce(
        (acc, kind) => {
          const defaultModel = getDefaultModelOption(kind);
          const currentModels =
            activeTab === 'provider'
              ? providerTabModelsByKind[kind]
              : gatewayTabModelsByKind[kind];
          const selectedModelId = selectedModelIds[kind] ?? defaultModel.id;

          acc[kind] =
            currentModels.find(model => model.id === selectedModelId) ??
            defaultModel;

          return acc;
        },
        {} as Record<ModelKind, ModelOption>,
      ),
    [
      activeTab,
      gatewayTabModelsByKind,
      providerTabModelsByKind,
      selectedModelIds,
    ],
  );

  const selectedModel = selectedModelsByKind[activeModelKind];

  const getTopModelForProvider = (
    providerName: string,
  ): ModelOption | undefined => {
    const providerModels = displayedModels.filter(
      model => model.provider === providerName,
    );
    const preferredId =
      providerPreferredModels[activeModelKind]?.[providerName];
    if (preferredId) {
      const preferred = providerModels.find(model => model.id === preferredId);
      if (preferred) {
        return preferred;
      }
    }
    if (activeModelKind === 'text' && providerName === 'openai') {
      const gptModels = providerModels.filter(model =>
        model.name.startsWith('GPT'),
      );
      return gptModels[0] || providerModels[0];
    }
    return providerModels[0];
  };

  const handleProviderClick = (providerName: string) => {
    const topModel = getTopModelForProvider(providerName);
    if (topModel) {
      const nextModelIds: Record<ModelKind, string> = {
        ...selectedModelIds,
        [activeModelKind]: topModel.id,
      };
      setSelectedModelIds(nextModelIds);
      setShowProviderOnly(providerName);
      updateSelection(nextModelIds, activeTab);
      onModelChange?.();
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setShowProviderOnly(null);
    updateSelection(selectedModelIds, tab);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = TABS.findIndex(tab => tab.id === activeTab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = TABS.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    const nextTab = TABS[nextIndex].id;
    handleTabChange(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const handleModelSelect = (option: ModelOption) => {
    const nextModelIds: Record<ModelKind, string> = {
      ...selectedModelIds,
      [activeModelKind]: option.id,
    };
    setSelectedModelIds(nextModelIds);
    setShowProviderOnly(null);
    updateSelection(nextModelIds, activeTab);
    onModelChange?.();
  };

  // Replace placeholders in code
  const processedCode = useMemo(() => {
    let result = code;

    const getModelExpression = (model: ModelOption, kind: ModelKind) => {
      if (activeTab === 'gateway') {
        return `"${model.id}"`;
      }

      if (activeTab === 'provider') {
        const sdkInfo = providerSdkMap[model.provider];
        const exportName = sdkInfo?.export ?? model.provider;
        const modelCode =
          providerModelCodeOverrides[model.id] ??
          (model.provider === 'anthropic'
            ? model.code.replace(/\./g, '-')
            : model.code);

        return `${exportName}${MODEL_KIND_FACTORY_SUFFIX[kind]}("${modelCode}")`;
      }

      return `yourProvider${MODEL_KIND_FACTORY_SUFFIX[kind]}("your-model-id")`;
    };

    for (const kind of placeholderKinds) {
      const expression = getModelExpression(selectedModelsByKind[kind], kind);
      for (const placeholder of MODEL_KIND_PLACEHOLDERS[kind]) {
        result = result.replace(new RegExp(placeholder, 'g'), expression);
      }
    }

    // Replace __PROVIDER_IMPORT__ placeholder
    if (activeTab === 'gateway') {
      // Remove the entire line containing __PROVIDER_IMPORT__
      result = result.replace(/.*__PROVIDER_IMPORT__.*\n?/g, '');
    } else if (activeTab === 'provider') {
      const sdkInfo = providerSdkMap[selectedModel.provider];
      const pkgName = sdkInfo?.pkg ?? selectedModel.provider;
      const exportName = sdkInfo?.export ?? selectedModel.provider;
      result = result.replace(
        /__PROVIDER_IMPORT__/g,
        `import { ${exportName} } from "@ai-sdk/${pkgName}"`,
      );
    } else {
      // custom
      result = result.replace(
        /__PROVIDER_IMPORT__/g,
        `import { yourProvider } from "your-custom-provider"`,
      );
    }

    return result.trim();
  }, [activeTab, code, placeholderKinds, selectedModel, selectedModelsByKind]);

  const activeHighlightedLines = useMemo(
    () =>
      (activeTab === 'gateway'
        ? highlightedLines
        : (highlightedLinesWithImport ?? highlightedLines)) ?? [],
    [activeTab, highlightedLines, highlightedLinesWithImport],
  );

  // Client-side shiki highlighting. Until the highlighter resolves, a plain
  // fallback renders the same `.line` span structure inside the same
  // CodeBlock so there is no layout shift.
  const highlightKey = `${activeHighlightedLines.join(',')}|${processedCode}`;
  const [highlighted, setHighlighted] = useState<{
    key: string;
    html: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    highlightCode(processedCode, activeHighlightedLines)
      .then(html => {
        if (!cancelled && html) {
          setHighlighted({
            key: `${activeHighlightedLines.join(',')}|${processedCode}`,
            html,
          });
        }
      })
      .catch(() => {
        // Highlighting failed to load; the plain fallback stays visible.
      });

    return () => {
      cancelled = true;
    };
  }, [processedCode, activeHighlightedLines]);

  const highlightedHtml =
    highlighted?.key === highlightKey ? highlighted.html : null;

  const plainLines = processedCode.split('\n');

  return (
    <div
      className={cx(
        'not-prose my-8 flex w-full flex-col rounded-lg border border-gray-alpha-400 bg-background-100',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 border-gray-alpha-400 border-b px-4">
        <div
          aria-label="Model provider source"
          aria-orientation="horizontal"
          className="-mb-px flex items-center gap-1"
          role="tablist"
        >
          {TABS.map(tab => (
            <button
              aria-controls={`${id}-panel`}
              aria-selected={activeTab === tab.id}
              className={cx(
                'flex items-center gap-1.5 border-b-2 px-3 py-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700',
                activeTab === tab.id
                  ? 'border-gray-1000 font-medium text-gray-1000'
                  : 'border-transparent text-gray-900 hover:text-gray-1000',
              )}
              id={`${id}-tab-${tab.id}`}
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              onKeyDown={handleTabKeyDown}
              ref={element => {
                tabRefs.current[tab.id] = element;
              }}
              role="tab"
              tabIndex={activeTab === tab.id ? 0 : -1}
              type="button"
            >
              <span className="text-gray-900">{tab.icon}</span>
              {tab.title}
            </button>
          ))}
        </div>

        <div className="hidden py-2.5 sm:block">
          {activeTab === 'custom' ? (
            <Link
              aria-label="Custom provider documentation"
              className="flex size-8 items-center justify-center rounded-md text-gray-900 transition-colors hover:bg-gray-100 hover:text-gray-1000"
              href={resolveHref(
                '/providers/community-providers/custom-providers',
              )}
            >
              <IconArrowUpRight size={16} />
            </Link>
          ) : (
            <ModelDropdown
              onProviderSelect={handleProviderClick}
              onSelect={handleModelSelect}
              options={displayedModels}
              providers={providers}
              selected={selectedModel}
              showProviderOnly={showProviderOnly}
            />
          )}
        </div>
      </div>

      <div
        aria-labelledby={`${id}-tab-${activeTab}`}
        className="[&>div]:mb-0"
        data-language={language}
        id={`${id}-panel`}
        role="tabpanel"
      >
        <CodeBlock
          className="shiki geist line-numbers rounded-none border-0 bg-transparent py-4"
          tabIndex={0}
        >
          {highlightedHtml ? (
            <code
              // Shiki output rendered inside the Geistdocs CodeBlock pre,
              // mirroring the DOM shape the MDX pipeline emits at build time.
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <code>
              {plainLines.map((line, index) => (
                <span
                  className={cx(
                    'line',
                    activeHighlightedLines.includes(index + 1) && 'highlighted',
                  )}
                  // eslint-disable-next-line react/no-array-index-key
                  key={index}
                >
                  {line}
                  {'\n'}
                </span>
              ))}
            </code>
          )}
        </CodeBlock>
      </div>

      {children ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
};
