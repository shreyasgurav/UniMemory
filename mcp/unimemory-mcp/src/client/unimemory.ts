/**
 * UniMemory API Client
 * Wraps the UniMemory API for MCP tools
 */

export interface SearchResult {
  memory_id: string;
  content: string;
  salience: number;
  source_id?: string;
  created_at: string;
}

export interface MemoryContext {
  memory_id: string;
  content: string;
  summary?: string;
  source_type?: string;
  source_id?: string;
  raw_excerpt?: string;
  created_at: string;
}

export interface Source {
  id: string;
  type: string;
  title?: string;
  summary?: string;
  raw_content?: unknown;
  created_at: string;
}

export interface Memory {
  id: string;
  content: string;
  category?: string;
  salience?: number;
  created_at: string;
}

export class UniMemoryClient {
  private apiUrl: string;
  private token: string;
  private authType: 'bearer' | 'apikey';

  constructor(apiUrl: string, token: string, authType: 'bearer' | 'apikey' = 'bearer') {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.token = token;
    this.authType = authType;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Support both Bearer token (consumer MCP) and API key (developer MCP)
    if (this.authType === 'bearer') {
      headers['Authorization'] = `Bearer ${this.token}`;
    } else {
      headers['X-API-Key'] = this.token;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`UniMemory API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Search memories by query
   */
  async searchMemories(
    query: string,
    options: {
      limit?: number;
      user_id?: string;
      project_id?: string;
    } = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, user_id, project_id } = options;

    const body: Record<string, any> = { query, limit };
    if (user_id) body.user_id = user_id;
    if (project_id) body.project_id = project_id;

    const response = await this.request<{ results: SearchResult[] }>(
      'POST',
      '/api/v1/search',
      body
    );

    return response.results || [];
  }

  /**
   * Get a specific memory by ID
   */
  async getMemory(memoryId: string): Promise<Memory | null> {
    try {
      const memory = await this.request<Memory>(
        'GET',
        `/api/v1/memories/${memoryId}`
      );
      return memory;
    } catch {
      return null;
    }
  }

  /**
   * Get memory with full context (linked source)
   */
  async getMemoryContext(memoryId: string): Promise<MemoryContext | null> {
    try {
      const memory = await this.getMemory(memoryId);
      if (!memory) return null;

      // Try to get linked sources
      let source: Source | null = null;
      try {
        const sourcesResponse = await this.request<{ sources: Source[] }>(
          'GET',
          `/api/v1/memories/${memoryId}/sources`
        );
        if (sourcesResponse.sources && sourcesResponse.sources.length > 0) {
          source = sourcesResponse.sources[0];
        }
      } catch {
        // No linked source, that's okay
      }

      return {
        memory_id: memory.id,
        content: memory.content,
        summary: source?.summary,
        source_type: source?.type,
        source_id: source?.id,
        raw_excerpt: source?.raw_content
          ? truncateContent(source.raw_content, 500)
          : undefined,
        created_at: memory.created_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get a source by ID
   */
  async getSource(sourceId: string): Promise<Source | null> {
    try {
      const source = await this.request<Source>(
        'GET',
        `/api/v1/sources/${sourceId}`
      );
      return source;
    } catch {
      return null;
    }
  }

  /**
   * Save a new memory
   */
  async saveMemory(
    content: string,
    options: {
      user_id?: string;
      category?: string;
      project_id?: string;
    } = {}
  ): Promise<Memory> {
    const body: Record<string, any> = { content };
    if (options.user_id) body.user_id = options.user_id;
    if (options.category) body.category = options.category;
    if (options.project_id) body.project_id = options.project_id;

    const response = await this.request<Memory>('POST', '/api/v1/memories', body);
    return response;
  }

  /**
   * Ingest a source (chat, document, or text)
   * This triggers full ingestion pipeline: title, summary, memory extraction
   */
  async ingestSource(
    endpoint: string,
    payload: {
      raw_content: string | Record<string, any>;
      metadata?: Record<string, any>;
      project_id?: string;
    }
  ): Promise<{
    source_id: string;
    title?: string;
    summary?: string;
    memories_count?: number;
  }> {
    const response = await this.request<{
      source_id: string;
      title?: string;
      summary?: string;
      memories_count?: number;
    }>('POST', endpoint, payload);
    return response;
  }

  /**
   * List all projects
   */
  async getProjects(): Promise<any[]> {
    try {
      const response = await this.request<{ projects: any[] }>(
        'GET',
        '/api/v1/projects'
      );
      return response.projects || [];
    } catch {
      return [];
    }
  }

  /**
   * Get project status with recent memories and sources
   */
  async getProjectStatus(projectId: string): Promise<any | null> {
    try {
      const response = await this.request<any>(
        'GET',
        `/api/v1/projects/${projectId}/status`
      );
      return response;
    } catch {
      return null;
    }
  }

  /**
   * Update project status
   */
  async updateProjectStatus(
    projectId: string,
    options: { status?: string; status_note?: string }
  ): Promise<any | null> {
    try {
      const response = await this.request<any>(
        'PATCH',
        `/api/v1/projects/${projectId}/status`,
        options
      );
      return response;
    } catch {
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request<{ status: string }>('GET', '/api/v1/health');
      return true;
    } catch {
      return false;
    }
  }
}

function truncateContent(content: unknown, maxLength: number): string {
  let text: string;
  if (typeof content === 'string') {
    text = content;
  } else if (typeof content === 'object') {
    text = JSON.stringify(content);
  } else {
    text = String(content);
  }
  
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
