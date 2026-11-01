"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { User } from "firebase/auth";

interface NewMemoryModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function NewMemoryModal({ user, isOpen, onClose, onSuccess }: NewMemoryModalProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirectMemory, setIsDirectMemory] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!content.trim() || !user) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const firebaseToken = await user.getIdToken();
      
      // Get consumer session token required by the ingest endpoints
      const sessionResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consumer/auth/session`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firebaseToken}`,
        },
      });

      if (!sessionResponse.ok) {
        throw new Error("Failed to authenticate session.");
      }

      const sessionData = await sessionResponse.json();
      const sessionToken = sessionData.session_token;

      const endpoint = isDirectMemory ? "/memories" : "/ingest/text";
      const payload = isDirectMemory 
        ? {
            content: content.trim().slice(0, 50000),
            user_id: user.uid,
            app_id: "dashboard",
            tags: ["dashboard_manual"],
          }
        : {
            content: content.trim().slice(0, 50000),
            user_id: user.uid,
            app_id: "dashboard",
            create_source: true,
          };

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errMessage = "Failed to save memory.";
        try {
          const errData = await response.json();
          if (errData.detail) {
            errMessage = typeof errData.detail === 'string' 
              ? errData.detail 
              : JSON.stringify(errData.detail);
          } else {
            errMessage = JSON.stringify(errData);
          }
        } catch (e) { }
        throw new Error(errMessage);
      }

      setContent("");
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Ingest error:", err);
      setError(typeof err.message === 'string' ? err.message : JSON.stringify(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl flex flex-col h-auto max-h-[85vh]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900">Add New Memory</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">
            {error}
          </div>
        )}

        <div className="mb-4 flex items-center gap-4 bg-neutral-50 p-1.5 rounded-lg border border-neutral-200">
          <button
            onClick={() => setIsDirectMemory(false)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              !isDirectMemory ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Extract via AI
          </button>
          <button
            onClick={() => setIsDirectMemory(true)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              isDirectMemory ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Direct Memory
          </button>
        </div>

        <div className="flex-1 overflow-y-auto mb-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={isDirectMemory ? "Type a specific memory to save directly (e.g. 'My name is John')..." : "Paste text, chat history, or anything you'd like to remember..."}
            className="w-full h-64 min-h-[200px] p-4 text-sm bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-y"
            disabled={isSubmitting}
          />
        </div>

        <div className="flex justify-end gap-3 mt-auto">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || isSubmitting}
            className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Save to UniMemory"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
