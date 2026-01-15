"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, FileText, Sparkles, ChevronDown, ChevronUp, Brain } from "lucide-react";
import { auth } from "@/lib/firebase";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  memories?: Array<{ id: string; content: string; salience: number; sector?: string }>;
  sources?: Array<{ id: string; type: string; summary?: string; created_at: string }>;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useMemory, setUseMemory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMemoryContext = async (query: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/chat/context`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, limit: 10 }),
      });

      if (!response.ok) return { memories: [], sources: [] };
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch memory context:", error);
      return { memories: [], sources: [] };
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Fetch memory context if enabled
      let context = { memories: [], sources: [] };
      if (useMemory) {
        context = await fetchMemoryContext(input);
      }

      // Simulate AI response (replace with actual LLM call)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: useMemory
          ? `Based on your memories, I found ${context.memories.length} relevant memories and ${context.sources.length} sources. Here's what I know:\n\n${input}\n\nThis is a demo response. In production, this would be powered by an LLM with your memory context.`
          : `This is a demo response without memory context. In production, this would be powered by an LLM.`,
        memories: context.memories,
        sources: context.sources,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-50">
      {/* Header */}
      <div className="px-6 py-4">
        <h1 className="text-2xl font-semibold text-neutral-900">Chat</h1>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-neutral-500">
              <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce delay-100" />
              <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce delay-200" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative bg-white rounded-full shadow-sm h-12">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="What can I do for you?"
              className="w-full h-12 bg-transparent px-5 py-0 pr-14 rounded-full focus:outline-none focus:ring-0 border-0 resize-none text-sm text-neutral-800 placeholder-neutral-500 leading-[48px]"
              rows={1}
              style={{ maxHeight: "200px" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="absolute top-1/2 -translate-y-1/2 right-2 w-9 h-9 rounded-full bg-neutral-800 text-white border border-neutral-800 flex items-center justify-center hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed shadow"
              aria-label="Send"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const [showContext, setShowContext] = useState(false);
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] ${isUser ? "" : "space-y-3"}`}>
        {/* Message content */}
        <div
          className={`px-4 py-3 rounded-2xl ${isUser
              ? "bg-neutral-900 text-white"
              : "bg-neutral-100 text-neutral-900"
            }`}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Memory context (only for assistant) */}
        {!isUser && (message.memories?.length || message.sources?.length) ? (
          <div className="space-y-2">
            <button
              onClick={() => setShowContext(!showContext)}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              {showContext ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              {message.memories?.length || 0} memories, {message.sources?.length || 0} sources
            </button>

            {showContext && (
              <div className="space-y-2">
                {/* Memories */}
                {message.memories && message.memories.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-neutral-600 flex items-center gap-1.5">
                      <Brain className="w-3 h-3" />
                      Referenced Memories
                    </p>
                    {message.memories.map((mem) => (
                      <div
                        key={mem.id}
                        className="bg-white border border-neutral-200 rounded-lg p-2.5 text-xs"
                      >
                        <p className="text-neutral-700">{mem.content}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {mem.sector && (
                            <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px]">
                              {mem.sector}
                            </span>
                          )}
                          <span className="text-neutral-400 text-[10px]">
                            Salience: {(mem.salience * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-neutral-600 flex items-center gap-1.5">
                      <FileText className="w-3 h-3" />
                      Referenced Sources
                    </p>
                    {message.sources.map((source) => (
                      <div
                        key={source.id}
                        className="bg-white border border-neutral-200 rounded-lg p-2.5 text-xs"
                      >
                        <p className="text-neutral-700 font-medium">{source.type}</p>
                        {source.summary && (
                          <p className="text-neutral-500 mt-1">{source.summary}</p>
                        )}
                        <p className="text-neutral-400 text-[10px] mt-1.5">
                          {new Date(source.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
