const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://unimemory.up.railway.app/api/v1";

interface RequestOptions {
  token: string;
  method?: string;
  body?: any;
}

async function request<T>(endpoint: string, options: RequestOptions): Promise<T> {
  const { token, method = "GET", body } = options;

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// Types
export interface Source {
  id: string;
  type: string;
  raw_content: any;
  summary: string | null;
  source_metadata: any;
  end_user_id: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string | null;
}

export interface Memory {
  id: string;
  content: string;
  sector: string | null;
  salience: number;
  tags: string[];
  user_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface SourceWithMemories extends Source {
  memories: Memory[];
  memory_count: number;
}

export interface MemoryWithSources extends Memory {
  sources: Source[];
}

export interface SearchResult {
  id: string;
  content: string;
  sector: string | null;
  salience: number;
  tags: string[];
  similarity: number;
}

// Sources API
export const getSources = async (token: string, limit: number = 50, offset: number = 0) => {
  return request<Source[]>(`/consumer/sources?limit=${limit}&offset=${offset}`, { token });
};

export const getSourcesCount = async (token: string) => {
  return request<{ total: number }>("/consumer/sources/count", { token });
};

export const getSource = async (token: string, sourceId: string) => {
  return request<SourceWithMemories>(`/consumer/sources/${sourceId}`, { token });
};

// Memories API
export const getMemories = async (token: string, limit: number = 50, offset: number = 0) => {
  return request<Memory[]>(`/consumer/memories?limit=${limit}&offset=${offset}`, { token });
};

export const getMemoriesCount = async (token: string) => {
  return request<{ total: number }>("/consumer/memories/count", { token });
};

export const getMemory = async (token: string, memoryId: string) => {
  return request<MemoryWithSources>(`/consumer/memories/${memoryId}`, { token });
};

export const updateMemoryTags = async (token: string, memoryId: string, tags: string[]) => {
  return request<Memory>(`/consumer/memories/${memoryId}/tags`, {
    token,
    method: "PATCH",
    body: { tags },
  });
};

export const deleteMemory = async (token: string, memoryId: string) => {
  return request<{ success: boolean }>(`/consumer/memories/${memoryId}`, {
    token,
    method: "DELETE",
  });
};

// Search API
export const searchMemories = async (token: string, query: string, limit: number = 20) => {
  return request<SearchResult[]>("/search", {
    token,
    method: "POST",
    body: { query, top_k: limit },
  });
};
