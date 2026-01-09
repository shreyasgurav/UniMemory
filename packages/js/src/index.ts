/**
 * UniMemory SDK
 * AI memory management for your applications
 */

export interface UniMemoryConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface AddMemoryOptions {
  content: string;
  sourceApp?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface AddMemoryResponse {
  wasWorthRemembering: boolean;
  reason?: string;
  extractedCount: number;
  memories?: Array<{ id: string; wasDeduplicated: boolean }>;
}

export interface SearchOptions {
  limit?: number;
  userId?: string;
  minSalience?: number;
  debug?: boolean;
}

export interface SearchResult {
  id: string;
  content: string;
  sector?: string;
  salience: number;
  score: number;
  tags: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

export interface Memory {
  id: string;
  content: string;
  sector?: string;
  salience: number;
  tags: string[];
  createdAt: string;
}

export interface ListMemoriesOptions {
  limit?: number;
  offset?: number;
  userId?: string;
  sector?: string;
}

export interface ListMemoriesResponse {
  memories: Memory[];
  total: number;
}

class UniMemoryError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'UniMemoryError';
  }
}

export class UniMemory {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: UniMemoryConfig) {
    if (!config.apiKey) {
      throw new UniMemoryError('API key is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.unimemory.ai/api/v1';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new UniMemoryError(
        error.detail || `Request failed with status ${response.status}`,
        response.status,
        error.code
      );
    }

    return response.json();
  }

  /**
   * Add a memory to UniMemory
   */
  async addMemory(options: AddMemoryOptions): Promise<AddMemoryResponse> {
    const response = await this.request<{
      was_worth_remembering: boolean;
      reason?: string;
      extracted_count: number;
      memories?: Array<{ id: string; was_deduplicated: boolean }>;
    }>('POST', '/memories/add', {
      content: options.content,
      source_app: options.sourceApp,
      user_id: options.userId,
      metadata: options.metadata,
    });

    return {
      wasWorthRemembering: response.was_worth_remembering,
      reason: response.reason,
      extractedCount: response.extracted_count,
      memories: response.memories?.map((m) => ({
        id: m.id,
        wasDeduplicated: m.was_deduplicated,
      })),
    };
  }

  /**
   * Search memories
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const response = await this.request<{
      results: Array<{
        id: string;
        content: string;
        sector?: string;
        salience: number;
        score: number;
        tags: string[];
      }>;
      total: number;
      query: string;
    }>('POST', '/search', {
      query,
      limit: options?.limit,
      user_id: options?.userId,
      min_salience: options?.minSalience,
      debug: options?.debug,
    });

    return {
      results: response.results,
      total: response.total,
      query: response.query,
    };
  }

  /**
   * List memories
   */
  async listMemories(options?: ListMemoriesOptions): Promise<ListMemoriesResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());
    if (options?.userId) params.set('user_id', options.userId);
    if (options?.sector) params.set('sector', options.sector);

    const queryString = params.toString();
    const path = `/memories${queryString ? `?${queryString}` : ''}`;

    const response = await this.request<{
      memories: Array<{
        id: string;
        content: string;
        sector?: string;
        salience: number;
        tags: string[];
        created_at: string;
      }>;
      total: number;
    }>('GET', path);

    return {
      memories: response.memories.map((m) => ({
        id: m.id,
        content: m.content,
        sector: m.sector,
        salience: m.salience,
        tags: m.tags,
        createdAt: m.created_at,
      })),
      total: response.total,
    };
  }

  /**
   * Delete a memory
   */
  async deleteMemory(memoryId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/memories/${memoryId}`);
  }
}

export default UniMemory;

