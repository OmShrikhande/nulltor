export type LLMProvider =
  | 'groq'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'openrouter'
  | 'mistral'
  | 'ollama'
  | 'custom';

export interface ProviderPreset {
  id: LLMProvider;
  name: string;
  badge: string;
  defaultBaseUrl: string;
  defaultModel: string;
  models: string[];
  keyPlaceholder: string;
  requiresKey: boolean;
  helpText: string;
}

export const PROVIDER_PRESETS: Record<LLMProvider, ProviderPreset> = {
  groq: {
    id: 'groq',
    name: 'Groq Cloud (Default #1)',
    badge: 'GROQ',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'qwen/qwen3.8-27b',
    models: [
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'qwen/qwen3.6-27b',
      'groq/compound',
    ],
    keyPlaceholder: 'Server pre-configured (or enter personal gsk_... key)',
    requiresKey: false,
    helpText: 'Default #1: Ultra-fast inference with Qwen 3.8-27B. Server key provided.',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini (Default #2)',
    badge: 'GEMINI',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-flash-lite-latest',
    models: [
      'gemini-flash-lite-latest',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
      'gemini-3.6-flash',
    ],
    keyPlaceholder: 'Server pre-configured (or enter personal AQ... / AIzaSy... key)',
    requiresKey: false,
    helpText: 'Default #2: High-quota backup with Gemini Flash Lite. Server key provided.',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    badge: 'OPENAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    keyPlaceholder: 'sk-proj-... or sk-...',
    requiresKey: true,
    helpText: 'Industry standard reasoning. Keys from platform.openai.com',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    badge: 'CLAUDE',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: [
      'claude-3-5-sonnet-20241022',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-haiku-20241022',
    ],
    keyPlaceholder: 'sk-ant-api03-...',
    requiresKey: true,
    helpText: 'Top-tier code reasoning. Keys from console.anthropic.com',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek Direct',
    badge: 'DEEPSEEK',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyPlaceholder: 'sk-...',
    requiresKey: true,
    helpText: 'Direct DeepSeek V3 / R1 reasoning. Keys from platform.deepseek.com',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter (All-in-One)',
    badge: 'OPENROUTER',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-r1',
    models: [
      'deepseek/deepseek-r1',
      'anthropic/claude-3.7-sonnet',
      'meta-llama/llama-3.3-70b-instruct',
      'qwen/qwen-2.5-coder-32b-instruct',
    ],
    keyPlaceholder: 'sk-or-v1-...',
    requiresKey: true,
    helpText: 'Single key for Claude, DeepSeek, Llama & 100+ models at openrouter.ai',
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    badge: 'MISTRAL',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'codestral-latest',
    models: ['codestral-latest', 'mistral-large-latest', 'mistral-small-latest'],
    keyPlaceholder: 'Api Key...',
    requiresKey: true,
    helpText: 'Codestral & Mistral models from console.mistral.ai',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local Offline)',
    badge: 'LOCAL',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5-coder:32b',
    models: ['qwen2.5-coder:32b', 'deepseek-r1:14b', 'llama3.3:latest', 'codellama:latest'],
    keyPlaceholder: 'Optional (e.g. ollama)',
    requiresKey: false,
    helpText: 'Runs locally on your computer with zero external data transmission.',
  },
  custom: {
    id: 'custom',
    name: 'Custom OpenAI-Compatible API',
    badge: 'CUSTOM',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'custom-model',
    models: ['custom-model'],
    keyPlaceholder: 'Enter custom API key (or leave empty if unauthenticated)',
    requiresKey: false,
    helpText: 'Connect LMStudio, vLLM, LocalAI, or custom inference proxies.',
  },
};

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

const STORAGE_KEY_PROVIDER = 'nulltor_llm_provider';
const STORAGE_KEY_KEY = 'nulltor_llm_key';
const STORAGE_KEY_MODEL = 'nulltor_llm_model';
const STORAGE_KEY_BASE_URL = 'nulltor_llm_base_url';

export function loadLLMConfig(): LLMConfig {
  const provider = (localStorage.getItem(STORAGE_KEY_PROVIDER) as LLMProvider) || 'groq';
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS['groq'];

  const apiKey =
    localStorage.getItem(STORAGE_KEY_KEY) ||
    localStorage.getItem('nulltor_groq_key') ||
    '';

  const model = localStorage.getItem(STORAGE_KEY_MODEL) || preset.defaultModel;
  const baseUrl = localStorage.getItem(STORAGE_KEY_BASE_URL) || preset.defaultBaseUrl;

  return {
    provider,
    apiKey,
    model,
    baseUrl,
  };
}

export function saveLLMConfig(config: Partial<LLMConfig>): LLMConfig {
  const current = loadLLMConfig();
  const next: LLMConfig = {
    ...current,
    ...config,
  };

  localStorage.setItem(STORAGE_KEY_PROVIDER, next.provider);
  localStorage.setItem(STORAGE_KEY_KEY, next.apiKey);
  localStorage.setItem(STORAGE_KEY_MODEL, next.model);
  localStorage.setItem(STORAGE_KEY_BASE_URL, next.baseUrl);
  // Keep backward-compatible key
  localStorage.setItem('nulltor_groq_key', next.apiKey);

  return next;
}

export interface ServerDefaultModel {
  id: 'groq' | 'gemini';
  title: string;
  badge: string;
  model: string;
  description: string;
  provider: LLMProvider;
  baseUrl: string;
}

export const SERVER_DEFAULT_MODELS: ServerDefaultModel[] = [
  {
    id: 'groq',
    title: 'Groq (Default #1)',
    badge: 'GROQ',
    model: 'qwen/qwen3.8-27b',
    description: 'Ultra-fast inference · Qwen 3.8-27B',
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'gemini',
    title: 'Gemini (Default #2)',
    badge: 'GEMINI',
    model: 'gemini-flash-lite-latest',
    description: 'High-quota backup · Gemini Flash Lite',
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
];

