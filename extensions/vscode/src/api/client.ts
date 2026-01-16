/**
 * UniMemory API Client
 * Handles all API communication with UniMemory backend
 */

import * as vscode from 'vscode';

export interface Memory {
  id: string;
  content: string;
  sector?: string;
  salience: number;
  tags: string[];
  similarity?: number;
  created_at: string;
}

export interface SearchResult {
  results: Memory[];
  query: string;
}

export interface IngestResult {
  success: boolean;
  stored: number;
  skipped: number;
  source_id?: string;
  memories?: Memory[];
}

export interface Session {
  token: string;
  user: {
    id: string;
    email: string;
    name?: string;
  };
  expiresAt: number;
}

export class UniMemoryClient {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  private getApiUrl(): string {
    return vscode.workspace.getConfiguration('unimemory').get('apiUrl') || 
           'https://unimemory.up.railway.app/api/v1';
  }

  private getAppUrl(): string {
    return vscode.workspace.getConfiguration('unimemory').get('appUrl') || 
           'https://unimemory-app.vercel.app';
  }

  async getSession(): Promise<Session | null> {
    const session = this.context.globalState.get<Session>('unimemory_session');
    
    if (!session) return null;
    
    // Check if expired
    if (session.expiresAt && Date.now() > session.expiresAt) {
      await this.clearSession();
      return null;
    }
    
    return session;
  }

  async setSession(sessionData: {
    session_token: string;
    user: { id: string; email: string; name?: string };
    expires_in: number;
  }): Promise<void> {
    await this.context.globalState.update('unimemory_session', {
      token: sessionData.session_token,
      user: sessionData.user,
      expiresAt: Date.now() + (sessionData.expires_in * 1000)
    });
  }

  async clearSession(): Promise<void> {
    await this.context.globalState.update('unimemory_session', undefined);
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return !!session;
  }

  getLoginUrl(): string {
    return `${this.getAppUrl()}/extension/welcome?source=vscode`;
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: any;
    } = {}
  ): Promise<T> {
    const session = await this.getSession();
    
    if (!session) {
      console.log('[UniMemory API] No session found');
      throw new Error('Not authenticated. Please login first.');
    }

    const { method = 'GET', body } = options;
    const url = `${this.getApiUrl()}${endpoint}`;
    
    console.log('[UniMemory API] Request:', { method, url, body });

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${session.token}`,
        'Content-Type': 'application/json',
        'X-Client': 'vscode-extension',
        'X-Client-Version': '0.1.0'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 401) {
      await this.clearSession();
      throw new Error('Session expired. Please login again.');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Request failed' })) as { detail?: string };
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Search memories based on query
   */
  async searchMemories(query: string, limit: number = 5): Promise<SearchResult> {
    console.log('[UniMemory API] Searching memories:', { query, limit });
    const result = await this.request<SearchResult>('/consumer/search', {
      method: 'POST',
      body: { query, limit }
    });
    console.log('[UniMemory API] Search result:', result);
    return result;
  }

  /**
   * Create a new memory from text
   */
  async createMemory(content: string, options: {
    tags?: string[];
    appId?: string;
  } = {}): Promise<Memory> {
    return this.request<Memory>('/memories', {
      method: 'POST',
      body: {
        content,
        user_id: 'consumer',
        app_id: options.appId || 'vscode',
        tags: options.tags || []
      }
    });
  }

  /**
   * Ingest chat conversation
   */
  async ingestChat(messages: Array<{ role: string; content: string }>, metadata: {
    platform: string;
    title?: string;
    url?: string;
  }): Promise<IngestResult> {
    return this.request<IngestResult>('/ingest/chat', {
      method: 'POST',
      body: {
        messages,
        source_metadata: {
          ...metadata,
          captured_at: new Date().toISOString()
        }
      }
    });
  }

  /**
   * Ingest project context as a document
   */
  async ingestDocument(content: string, metadata: {
    type: string;
    title: string;
    projectName?: string;
  }): Promise<IngestResult> {
    return this.request<IngestResult>('/ingest/text', {
      method: 'POST',
      body: {
        content,
        source_type: 'project',
        source_metadata: {
          ...metadata,
          captured_at: new Date().toISOString()
        }
      }
    });
  }
}
