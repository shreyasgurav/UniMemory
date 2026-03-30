"use client";

import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getIdToken } from "@/lib/firebase";
import { getProcessingLogs, getLogsCount, ProcessingLog } from "@/lib/api";
import { Clock, CheckCircle, XCircle, FileText, ChevronLeft, ChevronRight } from "lucide-react";

export default function RequestsPage() {
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const loadLogs = useCallback(async (newOffset: number = 0) => {
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;

      const [logsData, countData] = await Promise.all([
        getProcessingLogs(token, limit, newOffset),
        getLogsCount(token)
      ]);

      setLogs(logsData);
      setTotal(countData.total);
      setOffset(newOffset);
    } catch (error) {
      console.error("Failed to load logs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadLogs(0);
      }
    });

    return () => unsubscribe();
  }, [loadLogs]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Requests</h1>
        <p className="text-sm text-neutral-500 mt-2">
          Processing logs from ingest API calls
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <p className="text-sm text-neutral-500 mb-1">Total Requests</p>
          <p className="text-xl font-semibold text-neutral-900">{total}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <p className="text-sm text-neutral-500 mb-1">Stored (this page)</p>
          <p className="text-xl font-semibold text-green-600">
            {logs.filter(l => l.was_worth_remembering).length}
            <span className="text-xs font-normal text-neutral-400 ml-1">/ {logs.length}</span>
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <p className="text-sm text-neutral-500 mb-1">Skipped (this page)</p>
          <p className="text-xl font-semibold text-neutral-400">
            {logs.filter(l => !l.was_worth_remembering).length}
            <span className="text-xs font-normal text-neutral-400 ml-1">/ {logs.length}</span>
          </p>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <th className="text-left text-xs font-medium text-neutral-500 px-6 py-3">Status</th>
                <th className="text-left text-xs font-medium text-neutral-500 px-6 py-3">Timestamp</th>
                <th className="text-left text-xs font-medium text-neutral-500 px-6 py-3">Memories Extracted</th>
                <th className="text-left text-xs font-medium text-neutral-500 px-6 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-neutral-50">
                    <td colSpan={4} className="px-6 py-4">
                      <div className="h-5 bg-neutral-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-neutral-200" />
                    <p className="text-sm text-neutral-400">No requests yet</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                    <td className="px-6 py-4">
                      {log.was_worth_remembering ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Stored
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 bg-neutral-100 px-2 py-1 rounded-full">
                          <XCircle className="w-3 h-3" />
                          Skipped
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-neutral-600 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-neutral-400" />
                        {new Date(log.processed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-neutral-900">{log.extracted_count}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-neutral-500 truncate max-w-xs block">
                        {log.reason || "-"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-100 bg-neutral-50/30">
            <p className="text-sm text-neutral-500">
              Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadLogs(Math.max(0, offset - limit))}
                disabled={offset === 0 || loading}
                className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-neutral-600 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => loadLogs(offset + limit)}
                disabled={offset + limit >= total || loading}
                className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
