"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { api, setAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { FileText, Download, TrendingUp, TrendingDown } from "lucide-react";
import type { Transaction, TransactionsResponse } from "@/types/transaction";

export default function TransactionsClient() {
  const { data: session } = useSession();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  // Set token when session changes
  useEffect(() => {
    console.log("====== SESSION DEBUG START ======");
    console.log("[CLIENT] session exists:", !!session);
    console.log("[CLIENT] session:", session);
    if (session) {
      console.log("[CLIENT] session type:", typeof session);
      console.log("[CLIENT] session keys:", Object.keys(session));
      for (const [key, value] of Object.entries(session)) {
        if (typeof value === 'string' && key !== 'user') {
          console.log(`[CLIENT] session.${key}:`, value.substring(0, 50) + (value.length > 50 ? '...' : ''));
        } else if (key === 'user' && typeof value === 'object') {
          console.log(`[CLIENT] session.user:`, JSON.stringify(value));
        } else {
          console.log(`[CLIENT] session.${key}:`, value);
        }
      }
    }
    
    // Try multiple ways to access the token
    const token1 = session?.accessToken;
    const token2 = (session as { accessToken?: string })?.accessToken;
    
    console.log("[CLIENT] token1 (direct access):", token1 ? token1.substring(0, 50) + "..." : "undefined");
    console.log("[CLIENT] token2 (casted access):", token2 ? token2.substring(0, 50) + "..." : "undefined");
    console.log("[CLIENT] Final token value:", token1 || token2 ? (token1 || token2).substring(0, 50) + "..." : "undefined");
    
    const token = token1 || token2;
    
    if (token) {
      console.log("[CLIENT] ✓ Setting auth token");
      setAuthToken(token);
      console.log("[CLIENT] ✓ Token set from session, token preview:", token.substring(0, 50) + "...");
    } else if (session) {
      console.log("[CLIENT] ⚠ Session exists but NO accessToken found!");
      console.log("[CLIENT] Session object:", session);
      console.log("[CLIENT] This means NextAuth callbacks may not be working correctly");
    } else {
      console.log("[CLIENT] No session, clearing token");
      setAuthToken(undefined);
    }
    console.log("====== SESSION DEBUG END ======");
  }, [session]);

  async function fetchTransactions(next?: string | null) {
    try {
      const res = await api.get<TransactionsResponse>(
        `/api/transactions${next ? `?cursor=${next}` : ""}`
      );

      // Avoid duplicate transactions by filtering out IDs that already exist
      setTransactions((prev) => {
        const existingIds = new Set(prev.map(t => t.id));
        const newTransactions = res.data.data.filter(t => !existingIds.has(t.id));
        console.log(`[CLIENT] Fetched ${res.data.data.length} transactions, ${newTransactions.length} are new`);
        return [...prev, ...newTransactions];
      });
      setCursor(res.data.nextCursor);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
      setError("Failed to load transactions");
    }
  }

  async function handleExtract() {
    if (!text.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await api.post<Transaction>("/api/transactions/extract", {
        text
      });

      setTransactions((prev) => [res.data, ...prev]);
      setText("");
    } catch (err) {
      console.error("Extract error:", err);
      setError("Failed to extract transaction. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Only fetch if session exists AND has accessToken
    if (session?.accessToken) {
      console.log("[CLIENT] Token available, fetching transactions");
      fetchTransactions(null);
    } else if (session) {
      console.log("[CLIENT] Session exists but no accessToken yet, waiting...");
    }
  }, [session]);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-500 mt-1">Parse and manage your bank statements</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Input Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2 text-gray-700 mb-2">
          <FileText className="w-5 h-5" />
          <h2 className="font-semibold">Import Statement</h2>
        </div>
        
        <textarea
          className="w-full border border-gray-200 p-4 rounded-lg focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-opacity-20 outline-none transition-all resize-none"
          rows={5}
          placeholder="Paste your raw bank statement text here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="flex items-center gap-3">
          <Button 
            onClick={handleExtract} 
            disabled={loading || !text.trim()}
            className="gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Parsing...
              </>
            ) : (
              "Parse & Save"
            )}
          </Button>

          {error && (
            <p className="text-red-600 text-sm font-medium">{error}</p>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Confidence
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    No transactions yet. Import a statement to get started.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                      {t.date}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {t.description}
                    </td>
                    <td className="px-6 py-4 text-sm text-right whitespace-nowrap">
                      <span className={`font-semibold flex items-center justify-end gap-1 ${
                        Number(t.amount) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {Number(t.amount) >= 0 ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        ${Math.abs(Number(t.amount)).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        t.confidence >= 0.8
                          ? 'bg-green-100 text-green-800'
                          : t.confidence >= 0.5
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {(t.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {cursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchTransactions(cursor)}
            className="px-6"
          >
            Load more transactions
          </Button>
        </div>
      )}
    </div>
  );
}