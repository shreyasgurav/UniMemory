"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getIdToken } from "@/lib/firebase";
import { searchMemories, SearchResult } from "@/lib/api";
import { Search, Brain, Loader2 } from "lucide-react";

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const data = await searchMemories(token, query);
      setResults(data);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Search</h1>
        <p className="text-sm text-neutral-500 mt-2">
          Find memories by meaning, not just keywords
        </p>
      </div>

      {/* Search Input */}
      <div className="flex gap-2 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="What are you looking for?"
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="btn-primary px-6"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Search"}
        </button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
        </div>
      ) : searched && results.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
          <Search className="w-10 h-10 mx-auto mb-3 text-neutral-200" />
          <p className="text-neutral-600 font-medium">No results found</p>
          <p className="text-sm text-neutral-400 mt-1">Try different keywords</p>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-3">
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => router.push(`/memories/${result.id}`)}
              className="w-full bg-white border border-gray-100 rounded-2xl p-5 hover:border-neutral-200 hover:shadow-sm transition-all text-left"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                  <Brain className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-neutral-800 mb-2">{result.content}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {result.tags?.slice(0, 3).map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-neutral-50 text-neutral-600 text-xs rounded-full">
                        {tag}
                      </span>
                    ))}
                    <span className="text-xs text-neutral-400 ml-auto">
                      {(result.similarity * 100).toFixed(0)}% match
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-neutral-400">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Enter a query to search your memories</p>
        </div>
      )}
    </div>
  );
}
