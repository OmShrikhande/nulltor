import { get, post } from './client';

export interface ExtensionItem {
  id: string;
  name: string;
  displayName: string;
  publisher: string;
  description: string;
  version: string;
  downloads: number;
  rating: number;
  icon?: string;
  verified?: boolean;
}

export interface ExtensionsSearchResponse {
  total: number;
  extensions: ExtensionItem[];
  source: string;
}

export const extensionsApi = {
  search: (query?: string, category?: string, size = 25, offset = 0) => {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (category) params.append('category', category);
    params.append('size', String(size));
    params.append('offset', String(offset));
    return get<ExtensionsSearchResponse>(`/extensions/search?${params.toString()}`);
  },

  popular: (size = 25) => get<ExtensionsSearchResponse>(`/extensions/popular?size=${size}`),

  detail: (namespace: string, name: string) => get<ExtensionItem>(`/extensions/detail/${namespace}/${name}`),

  batch: (ids: string[]) => post<{ extensions: ExtensionItem[] }>('/extensions/batch', { ids }),
};
