import { post } from './client';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface ToolExecutionResult {
  tool: string;
  args: Record<string, any>;
  result: string;
}

export interface AgentRunResponse {
  reply: string;
  updated_messages: ChatMessage[];
  executed_tools: ToolExecutionResult[];
  code_modifications: Record<string, string>;
  new_files?: string[];
}

export const aiApi = {
  chat: (payload: {
    messages: ChatMessage[];
    project_id?: string;
    branch_id?: string;
    active_file_name?: string;
    active_file_content?: string;
    api_key?: string;
    model?: string;
    base_url?: string;
  }) => post<AgentRunResponse>('/ai/chat', payload),

  generate: (payload: {
    prompt: string;
    file_name?: string;
    file_content?: string;
    language?: string;
    action?: string;
  }) => post<{ code: string; explanation?: string }>('/ai/generate', payload),
};
