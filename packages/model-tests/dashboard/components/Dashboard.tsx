'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { ModelCapability } from '@/utils/fetchData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Image as ImageIcon,
  Headphones,
  FileAudio,
  FileImage,
  Box,
  FileText,
  Search,
  Type,
  WrenchIcon,
  Database,
  Upload,
  Keyboard,
  RefreshCw,
  ScatterChartIcon as Scatter,
  BookText,
  FileWarning,
  ShieldAlert,
} from 'lucide-react';
import UploadArchive from '@/components/UploadArchive';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import Link from 'next/link';
import Image from 'next/image';

interface DashboardProps {
  modelCapabilities: ModelCapability[];
}

const getModelTypeIcon = (modelType: string) => {
  let icon;
  switch (modelType) {
    case 'language':
      icon = <BookText className="h-4 w-4" />;
      break;
    case 'embedding':
      icon = <Scatter className="h-4 w-4" />;
      break;
    case 'image':
      icon = <ImageIcon className="h-4 w-4" />;
      break;
    default:
      return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>{icon}</TooltipTrigger>
        <TooltipContent>
          <p>{modelType}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const capabilityIcons: { [key: string]: JSX.Element } = {
  audioInput: <FileAudio className="h-4 w-4" />,
  embedding: <Scatter className="h-4 w-4" />,
  imageGeneration: <ImageIcon className="h-4 w-4" />,
  imageInput: <FileImage className="h-4 w-4" />,
  imageModelErrorHandling: <FileWarning className="h-4 w-4" />,
  languageModelErrorHandling: <ShieldAlert className="h-4 w-4" />,
  objectGeneration: <Box className="h-4 w-4" />,
  pdfInput: <FileText className="h-4 w-4" />,
  searchGrounding: <Search className="h-4 w-4" />,
  textCompletion: <Type className="h-4 w-4" />,
  toolCalls: <WrenchIcon className="h-4 w-4" />,
};

type SortConfig = {
  key: string;
  direction: 'ascending' | 'descending';
} | null;

const providerIconConfig: { [key: string]: { filename: string } } = {
  cerebras: { filename: 'cerebras.png' },
  deepinfra: { filename: 'deepinfra.svg' },
  deepseek: { filename: 'deepseek.svg' },
  fireworks: { filename: 'fireworks.png' },
  google: { filename: 'google.svg' },
  'google-vertex': { filename: 'google-vertex.svg' },
  'google-vertex-anthropic': { filename: 'google-vertex-anthropic.svg' },
  luma: { filename: 'luma.png' },
  openai: { filename: 'openai.svg' },
  perplexity: { filename: 'perplexity.svg' },
  togetherai: { filename: 'togetherai.svg' },
  xai: { filename: 'xai.svg' },
};

const getProviderIcon = (provider: string) => {
  const config = providerIconConfig[provider];
  if (config) {
    return (
      <Image
        src={`/icons/provider/${config.filename}`}
        alt={`${provider} icon`}
        width={32}
        height={32}
      />
    );
  }
  return <Database className="h-4 w-4" />;
};

const getCapabilityIcon = (capability: string) => {
  const icon = capabilityIcons[capability] || (
    <Headphones className="h-4 w-4" />
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>{icon}</TooltipTrigger>
        <TooltipContent>
          <p>{capability}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default function Dashboard({
  modelCapabilities: initialCapabilities,
}: DashboardProps) {
  const [modelCapabilities, setModelCapabilities] =
    useState(initialCapabilities);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [capabilityFilter, setCapabilityFilter] = useState('all');
  const [modelTypeFilter, setModelTypeFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const providers = useMemo(() => {
    return Array.from(new Set(modelCapabilities.map(m => m.provider)));
  }, [modelCapabilities]);

  const capabilities = useMemo(() => {
    const allCapabilities = modelCapabilities.flatMap(m =>
      Object.keys(m.capabilities),
    );
    return Array.from(new Set(allCapabilities));
  }, [modelCapabilities]);

  const modelTypes = useMemo(() => {
    return Array.from(new Set(modelCapabilities.map(m => m.modelType)));
  }, [modelCapabilities]);

  const sortedModels = useMemo(() => {
    const sortableModels = [...modelCapabilities];
    if (sortConfig !== null) {
      sortableModels.sort((a, b) => {
        if (
          a[sortConfig.key as keyof ModelCapability] <
          b[sortConfig.key as keyof ModelCapability]
        ) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (
          a[sortConfig.key as keyof ModelCapability] >
          b[sortConfig.key as keyof ModelCapability]
        ) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableModels;
  }, [modelCapabilities, sortConfig]);

  const filteredModels = useMemo(() => {
    return sortedModels.filter(model => {
      const matchesSearch =
        model.modelId.toLowerCase().includes(search.toLowerCase()) ||
        model.provider.toLowerCase().includes(search.toLowerCase());
      const matchesProvider =
        providerFilter === 'all' || model.provider === providerFilter;
      const matchesCapability =
        capabilityFilter === 'all' ||
        model.capabilities[capabilityFilter]?.supported;
      const matchesModelType =
        modelTypeFilter === 'all' || model.modelType === modelTypeFilter;
      return (
        matchesSearch &&
        matchesProvider &&
        matchesCapability &&
        matchesModelType
      );
    });
  }, [sortedModels, search, providerFilter, capabilityFilter, modelTypeFilter]);

  const requestSort = useCallback((key: string) => {
    setSortConfig(currentSortConfig => {
      if (currentSortConfig && currentSortConfig.key === key) {
        return currentSortConfig.direction === 'ascending'
          ? { key, direction: 'descending' }
          : null;
      }
      return { key, direction: 'ascending' };
    });
  }, []);

  const handleUpload = useCallback((newCapabilities: ModelCapability[]) => {
    setModelCapabilities(newCapabilities);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setProviderFilter('all');
    setCapabilityFilter('all');
    setModelTypeFilter('all');
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key.toLowerCase()) {
          case 'k':
            event.preventDefault();
            searchInputRef.current?.focus();
            break;
          case 'x':
            event.preventDefault();
            clearFilters();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearFilters]);

  return (
    <div className="space-y-8 p-6 bg-background">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4 items-center w-full">
          <div className="relative flex-grow max-w-2xl">
            <Input
              ref={searchInputRef}
              placeholder="Search models or providers"
              value={search}
              onChange={e => setSearch(e.target.value.trim())}
              className="bg-white border-zinc-300 pr-8 w-full dark:bg-zinc-800 dark:border-zinc-700"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-zinc-400">
              <Keyboard className="h-4 w-4 mr-1" />
              <span className="text-xs">K</span>
            </div>
          </div>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[180px] bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700">
              <SelectValue placeholder="Filter by provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {providers.map(provider => (
                <SelectItem key={provider} value={provider}>
                  <div className="flex items-center">
                    {getProviderIcon(provider)}
                    <span className="ml-2">{provider}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={modelTypeFilter} onValueChange={setModelTypeFilter}>
            <SelectTrigger className="w-[180px] bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700">
              <SelectValue placeholder="Filter by model type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Model Types</SelectItem>
              {modelTypes.map(modelType => (
                <SelectItem key={modelType} value={modelType}>
                  <div className="flex items-center">
                    {getModelTypeIcon(modelType)}
                    <span className="ml-2">{modelType}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={capabilityFilter} onValueChange={setCapabilityFilter}>
            <SelectTrigger className="w-[180px] bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700">
              <SelectValue placeholder="Filter by capability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Capabilities</SelectItem>
              {capabilities.map(capability => (
                <SelectItem key={capability} value={capability}>
                  <div className="flex items-center">
                    {capabilityIcons[capability]}
                    <span className="ml-2">{capability}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              onClick={clearFilters}
              className="bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Clear Filters
              <div className="ml-2 flex items-center text-zinc-400">
                <Keyboard className="h-3 w-3 mr-1" />
                <span className="text-xs">X</span>
              </div>
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsUploadOpen(!isUploadOpen)}
              className="bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-100 p-2 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <Upload className="h-4 w-4" />
            </Button>
            <DarkModeToggle />
          </div>
        </div>
        {isUploadOpen && (
          <div className="mt-4">
            <UploadArchive onUpload={handleUpload} />
          </div>
        )}
        <div className="bg-white rounded-lg shadow dark:bg-zinc-800">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-100 dark:bg-zinc-900">
                <TableHead
                  onClick={() => requestSort('provider')}
                  className="cursor-pointer"
                >
                  Provider{' '}
                  {sortConfig?.key === 'provider' &&
                    (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                </TableHead>
                <TableHead
                  onClick={() => requestSort('modelId')}
                  className="cursor-pointer"
                >
                  Model ID{' '}
                  {sortConfig?.key === 'modelId' &&
                    (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                </TableHead>
                <TableHead className="text-center">Type</TableHead>
                <TableHead>Capabilities</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredModels.map(model => (
                <TableRow
                  key={`${model.provider}-${model.modelId}`}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-700"
                >
                  <TableCell>
                    <div className="flex items-center">
                      {getProviderIcon(model.provider)}
                      <Link
                        href={`https://sdk.vercel.ai/providers/ai-sdk-providers/${model.provider.toLowerCase()}`}
                        className="ml-2 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {model.provider}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell>{model.modelId}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center">
                      {getModelTypeIcon(model.modelType)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(model.capabilities)
                        .filter(([, { supported }]) => supported)
                        .map(([capability]) => (
                          <span key={capability}>
                            {getCapabilityIcon(capability)}
                          </span>
                        ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
