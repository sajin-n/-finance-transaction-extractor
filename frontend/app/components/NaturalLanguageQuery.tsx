"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Sparkles, MessageSquare, Loader2 } from "lucide-react";

interface NLQResult {
  query: string;
  sqlLikeDescription: string;
  transactions: Array<{
    id: string;
    amount: number;
    description: string;
    date: string;
    category: string | null;
  }>;
  totalCount: number;
  aggregations?: {
    sum?: number;
    avg?: number;
    min?: number;
    max?: number;
    count?: number;
  };
}

export default function NaturalLanguageQuery() {
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NLQResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSuggestions();
  }, [session]);

  async function fetchSuggestions() {
    try {
      const res = await api.get<{ suggestions: string[] }>("/api/nlq/suggestions");
      setSuggestions(res.data.suggestions);
    } catch (err) {
      console.error("Failed to fetch suggestions:", err);
    }
  }

  async function handleSearch() {
    if (!query.trim()) return;
    
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await api.post<NLQResult>("/api/nlq/query", { query });
      setResult(res.data);
    } catch (err) {
      console.error("NLQ error:", err);
      setError("Failed to process query. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSuggestionClick(suggestion: string) {
    setQuery(suggestion);
    setResult(null);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Sparkles className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Natural Language Query</h3>
          <p className="text-sm text-gray-500">Ask questions about your transactions in plain English</p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <MessageSquare className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder='Try: "Show me all expenses over $100 last month"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading || !query.trim()} className="gap-2">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          Search
        </Button>
      </div>

      {/* Suggestions */}
      {!result && suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Try these queries</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 6).map((suggestion, i) => (
              <button
                key={i}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Interpreted as:</p>
            <code className="text-sm text-gray-700 font-mono">{result.sqlLikeDescription}</code>
          </div>

          {result.aggregations && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {result.aggregations.count !== undefined && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-600 font-medium">Count</p>
                  <p className="text-2xl font-bold text-blue-900">{result.aggregations.count}</p>
                </div>
              )}
              {result.aggregations.sum !== undefined && (
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-600 font-medium">Total</p>
                  <p className="text-2xl font-bold text-green-900">${result.aggregations.sum.toFixed(2)}</p>
                </div>
              )}
              {result.aggregations.avg !== undefined && (
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-purple-600 font-medium">Average</p>
                  <p className="text-2xl font-bold text-purple-900">${result.aggregations.avg.toFixed(2)}</p>
                </div>
              )}
              {result.aggregations.min !== undefined && result.aggregations.max !== undefined && (
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-orange-600 font-medium">Range</p>
                  <p className="text-lg font-bold text-orange-900">
                    ${result.aggregations.min.toFixed(2)} - ${result.aggregations.max.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b">
              <p className="text-sm font-medium text-gray-700">
                Found {result.totalCount} transaction{result.totalCount !== 1 ? "s" : ""}
                {result.transactions.length < result.totalCount && ` (showing ${result.transactions.length})`}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.transactions.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">{new Date(t.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{t.description}</td>
                      <td className="px-4 py-2 text-sm">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                          {t.category || "Uncategorized"}
                        </span>
                      </td>
                      <td className={`px-4 py-2 text-sm text-right font-medium ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${Math.abs(t.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
