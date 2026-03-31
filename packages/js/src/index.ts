/**
 * UniMemory SDK v2
 * The memory layer for AI applications
 *
 * Core API:    POST/GET/PATCH/DELETE /memories, POST /search
 * Ingest API:  POST /ingest/text, /ingest/chat, /ingest/document
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface UniMemoryConfig {
  apiKey: string;
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Core Memory types
// ---------------------------------------------------------------------------

export interface CreateMemoryOptions {
  content: string;
  userId?: string;
  appId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  projectId?: string;
}

export interface CreateMemoryResponse {
  id: string;
  createdAt: string;
}

export interface Memory {
  id: string;
  content: string;
  userId: string;
  tags: string[];
  salience: number;
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

export interface UpdateMemoryOptions {
  tags?: string[];
  salience?: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Search types
// ---------------------------------------------------------------------------

export interface SearchOptions {
  limit?: number;
  userId?: string;
  minSalience?: number;
  projectId?: string;
}

export interface SearchResult {
  id: string;
  content: string;
  tags: string[];
  salience: number;
  createdAt?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

// ---------------------------------------------------------------------------
// Ingest types
// ---------------------------------------------------------------------------

export interface IngestTextOptions {
  content: string;
  userId?: string;
  appId?: string;
  sourceId?: string;
  projectId?: string;
  createSource?: boolean;
}

export interface IngestChatOptions {
  messages: Array<{ role: string; content: string }>;
  userId?: string;
  appId?: string;
  sourceId?: string;
  projectId?: string;
  sourceMetadata?: Record<string, unknown>;
}

export interface IngestDocumentOptions {
  content: string;
  title?: string;
  userId?: string;
  appId?: string;
  sourceId?: string;
  projectId?: string;
}

export interface IngestResponse {
  stored: number;
  skipped: number;
  memoryIds: string[];
  tokensUsed: number;
  sourceId?: string;
  sourceTitle?: string;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class UniMemoryError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'UniMemoryError';
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class UniMemory {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: UniMemoryConfig) {
    if (!config.apiKey) {
      throw new UniMemoryError('API key is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://unimemory.up.railway.app/api/v1').replace(/\/$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };

    const init: RequestInit = { method, headers };
    if (body) init.body = JSON.stringify(body);

    const res = await fetch(`${this.baseUrl}${path}`, init);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new UniMemoryError(
        err.detail || `Request failed with status ${res.status}`,
        res.status,
        err.code
      );
    }

    if (res.status === 204) return {} as T;
    return res.json();
  }

  // -------------------------------------------------------------------------
  // Core Memory API
  // -------------------------------------------------------------------------

  /**
   * Store an explicit memory (deterministic, no LLM).
   */
  async add(options: CreateMemoryOptions): Promise<CreateMemoryResponse> {
    const res = await this.request<{ id: string; created_at: string }>(
      'POST', '/memories', {
        content: options.content,
        user_id: options.userId,
        app_id: options.appId,
        tags: options.tags,
        metadata: options.metadata,
        project_id: options.projectId,
      }
    );
    return { id: res.id, createdAt: res.created_at };
  }

  /**
   * List memories with optional filters.
   */
  async list(options?: ListMemoriesOptions): Promise<ListMemoriesResponse> {
    const p = new URLSearchParams();
    if (options?.limit) p.set('limit', String(options.limit));
    if (options?.offset) p.set('offset', String(options.offset));
    if (options?.userId) p.set('user_id', options.userId);
    if (options?.sector) p.set('sector', options.sector);
    const qs = p.toString();

    const res = await this.request<{
      memories: Array<{
        id: string; content: string; user_id: string;
        tags: string[]; salience: number; created_at: string;
      }>;
      total: number;
    }>('GET', `/memories${qs ? `?${qs}` : ''}`);

    return {
      memories: res.memories.map(m => ({
        id: m.id,
        content: m.content,
        userId: m.user_id,
        tags: m.tags,
        salience: m.salience,
        createdAt: m.created_at,
      })),
      total: res.total,
    };
  }

  /**
   * Get a single memory by ID.
   */
  async get(memoryId: string): Promise<Memory> {
    const m = await this.request<{
      id: string; content: string; user_id: string;
      tags: string[]; salience: number; created_at: string;
    }>('GET', `/memories/${memoryId}`);

    return {
      id: m.id, content: m.content, userId: m.user_id,
      tags: m.tags, salience: m.salience, createdAt: m.created_at,
    };
  }

  /**
   * Update a memory (tags, salience, metadata only — content cannot be changed).
   */
  async update(memoryId: string, options: UpdateMemoryOptions): Promise<Memory> {
    const m = await this.request<{
      id: string; content: string; user_id: string;
      tags: string[]; salience: number; created_at: string;
    }>('PATCH', `/memories/${memoryId}`, {
      tags: options.tags,
      salience: options.salience,
      metadata: options.metadata,
    });

    return {
      id: m.id, content: m.content, userId: m.user_id,
      tags: m.tags, salience: m.salience, createdAt: m.created_at,
    };
  }

  /**
   * Delete a memory.
   */
  async delete(memoryId: string): Promise<{ success: boolean; id: string }> {
    return this.request('DELETE', `/memories/${memoryId}`);
  }

  // -------------------------------------------------------------------------
  // Search API
  // -------------------------------------------------------------------------

  /**
   * Semantic search across memories.
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const res = await this.request<{
      results: Array<{
        id: string; content: string; tags: string[];
        salience: number; created_at?: string;
      }>;
      total: number;
      query: string;
    }>('POST', '/search', {
      query,
      limit: options?.limit,
      user_id: options?.userId,
      min_salience: options?.minSalience,
      project_id: options?.projectId,
    });

    return {
      results: res.results.map(r => ({
        id: r.id, content: r.content, tags: r.tags,
        salience: r.salience, createdAt: r.created_at,
      })),
      total: res.total,
      query: res.query,
    };
  }

  // -------------------------------------------------------------------------
  // Ingest API (LLM-powered, background processing)
  // -------------------------------------------------------------------------

  /**
   * Ingest raw text — LLM extracts memories in the background.
   */
  async ingestText(options: IngestTextOptions): Promise<IngestResponse> {
    return this.ingestRequest('/ingest/text', {
      content: options.content,
      user_id: options.userId,
      app_id: options.appId,
      source_id: options.sourceId,
      project_id: options.projectId,
      create_source: options.createSource,
    });
  }

  /**
   * Ingest chat messages — LLM extracts memories in the background.
   */
  async ingestChat(options: IngestChatOptions): Promise<IngestResponse> {
    return this.ingestRequest('/ingest/chat', {
      messages: options.messages,
      user_id: options.userId,
      app_id: options.appId,
      source_id: options.sourceId,
      project_id: options.projectId,
      source_metadata: options.sourceMetadata,
    });
  }

  /**
   * Ingest a document — LLM extracts memories in the background.
   */
  async ingestDocument(options: IngestDocumentOptions): Promise<IngestResponse> {
    return this.ingestRequest('/ingest/document', {
      content: options.content,
      title: options.title,
      user_id: options.userId,
      app_id: options.appId,
      source_id: options.sourceId,
      project_id: options.projectId,
    });
  }

  private async ingestRequest(path: string, body: unknown): Promise<IngestResponse> {
    const res = await this.request<{
      stored: number; skipped: number; memory_ids: string[];
      tokens_used: number; source_id?: string; source_title?: string;
    }>('POST', path, body);

    return {
      stored: res.stored,
      skipped: res.skipped,
      memoryIds: res.memory_ids,
      tokensUsed: res.tokens_used,
      sourceId: res.source_id,
      sourceTitle: res.source_title,
    };
  }
}

export default UniMemory;

