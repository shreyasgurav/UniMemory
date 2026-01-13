"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { getSource, SourceWithMemories } from "@/lib/api";
import { ArrowLeft, MessageSquare, FileText, Code, Globe, Brain, Clock, Tag } from "lucide-react";

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  chat: <MessageSquare className="w-5 h-5" />,
  document: <FileText className="w-5 h-5" />,
  code: <Code className="w-5 h-5" />,
  text: <FileText className="w-5 h-5" />,
  web: <Globe className="w-5 h-5" />,
};

function ChatViewer({ content }: { content: any }) {
  const messages = Array.isArray(content) ? content : content?.messages || [];
  return (
    <div className="space-y-3">
      {messages.map((msg: any, i: number) => (
        <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
            msg.role === "user" 
              ? "bg-neutral-900 text-white" 
              : "bg-neutral-100 text-neutral-800"
          }`}>
            {msg.content}
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentViewer({ content }: { content: any }) {
  const text = typeof content === "string" ? content : content?.text || JSON.stringify(content, null, 2);
  return (
    <div className="prose prose-sm max-w-none">
      <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-700 bg-neutral-50 p-4 rounded-xl">
        {text}
      </pre>
    </div>
  );
}

function CodeViewer({ content }: { content: any }) {
  const code = typeof content === "string" ? content : content?.code || JSON.stringify(content, null, 2);
  return (
    <pre className="bg-neutral-900 text-green-400 p-4 rounded-xl overflow-x-auto text-sm font-mono">
      {code}
    </pre>
  );
}

export default function SourceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sourceId = params?.id as string;
  
  const [source, setSource] = useState<SourceWithMemories | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && sourceId) {
        try {
          const token = await getIdToken();
          if (!token) return;
          const data = await getSource(token, sourceId);
          setSource(data);
        } catch (err: any) {
          setError(err.message || "Failed to load source");
        } finally {
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, [sourceId]);

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-neutral-100 rounded w-1/4" />
          <div className="h-64 bg-neutral-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">
          {error || "Source not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <button onClick={() => router.back()} className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Timeline
      </button>

      <div className="flex items-start gap-4 mb-8">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-neutral-100 text-neutral-600`}>
          {SOURCE_ICONS[source.type] || <FileText className="w-6 h-6" />}
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            {source.source_metadata?.title || `${source.type.charAt(0).toUpperCase() + source.type.slice(1)} Source`}
          </h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-neutral-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {new Date(source.created_at).toLocaleString()}
            </span>
            <span className="px-2 py-0.5 bg-neutral-100 rounded-full text-xs">
              {source.type}
            </span>
          </div>
        </div>
      </div>

      {/* Summary */}
      {source.summary && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 text-blue-600 text-sm font-medium mb-2">
            <Brain className="w-4 h-4" />
            AI-Generated Summary
          </div>
          <p className="text-neutral-700">{source.summary}</p>
        </div>
      )}

      {/* Raw Content */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Raw Content</h2>
        {source.type === "chat" ? (
          <ChatViewer content={source.raw_content} />
        ) : source.type === "code" ? (
          <CodeViewer content={source.raw_content} />
        ) : (
          <DocumentViewer content={source.raw_content} />
        )}
      </div>

      {/* Extracted Memories */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">
            Extracted Memories
          </h2>
          <span className="text-sm text-neutral-500">
            {source.memory_count || source.memories?.length || 0} memories
          </span>
        </div>

        {source.memories && source.memories.length > 0 ? (
          <div className="space-y-3">
            {source.memories.map((memory) => (
              <button
                key={memory.id}
                onClick={() => router.push(`/memories/${memory.id}`)}
                className="w-full text-left p-4 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                <p className="text-neutral-800 mb-2">{memory.content}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {memory.tags?.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white text-neutral-600 text-xs rounded-full border border-neutral-200">
                      <Tag className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                  <span className="text-xs text-neutral-400 ml-auto">
                    Salience: {(memory.salience * 100).toFixed(0)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-neutral-500 text-sm">No memories were extracted from this source.</p>
        )}
      </div>
    </div>
  );
}
