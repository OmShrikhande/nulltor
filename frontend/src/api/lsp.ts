import { post } from './client';

export interface DiagnosticItem {
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface CompletionItem {
  label: string;
  kind: string;
  detail?: string;
  insert_text?: string;
  documentation?: string;
}

export interface LSPAnalyzeResponse {
  diagnostics: DiagnosticItem[];
  completions: CompletionItem[];
}

export const lspApi = {
  analyze: (code: string, language: string, filename?: string) =>
    post<LSPAnalyzeResponse>('/lsp/analyze', { code, language, filename }),
};
