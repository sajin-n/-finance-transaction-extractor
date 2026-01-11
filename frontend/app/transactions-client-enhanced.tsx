"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { api, setAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  FileText, Download, TrendingUp, TrendingDown, Search, 
  Edit, Trash2, Check, X, Filter, BarChart3,
  CheckSquare, Square, AlertCircle, CheckCircle, Clock
} from "lucide-react";
import type { Transaction, TransactionsResponse, TransactionStats } from "@/types/transaction";

const CATEGORIES = [
  "All Categories",
  "Income",
  "Groceries",
  "Dining",
  "Transportation",
  "Utilities",
  "Housing",
  "Shopping",
  "Entertainment",
  "Healthcare",
  "Transfer",
  "Uncategorized"
];

const STATUSES = ["all", "pending", "verified", "flagged"];

export default function TransactionsClientEnhanced() {
  const { data: session } = useSession();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedStatus, setSelectedStatus] = useState("all");
  // Bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  
  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});

  // Stats view
  const [showStats, setShowStats] = useState(false);

  const fetchTransactions = useCallback(async (next?: string | null, reset = false) => {
    try {
      const params = new URLSearchParams();
      if (next) params.append("cursor", next);
      if (searchQuery) params.append("search", searchQuery);
      if (selectedCategory !== "All Categories") params.append("category", selectedCategory);
      if (selectedStatus !== "all") params.append("status", selectedStatus);

      const res = await api.get<TransactionsResponse>(
        `/api/transactions?${params.toString()}`
      );

      if (reset) {
        setTransactions(res.data.data);
      } else {
        setTransactions((prev) => {
          const existingIds = new Set(prev.map(t => t.id));
          const newTransactions = res.data.data.filter(t => !existingIds.has(t.id));
          return [...prev, ...newTransactions];
        });
      }
      setCursor(res.data.nextCursor);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
      setError("Failed to load transactions");
    }
  }, [searchQuery, selectedCategory, selectedStatus]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<TransactionStats>("/api/transactions/stats");
      setStats(res.data);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, []);
  useEffect(() => {
    if (session?.accessToken) {
      setAuthToken(session.accessToken as string);
      fetchTransactions(null);
      fetchStats();
    }
  }, [session, fetchTransactions, fetchStats]);


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
      fetchStats(); // Refresh stats
    } catch (err) {
      console.error("Extract error:", err);
      setError("Failed to extract transaction. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(id: string) {
    try {
      const res = await api.patch<Transaction>(`/api/transactions/${id}`, editForm);
      setTransactions(prev => prev.map(t => t.id === id ? res.data : t));
      setEditingId(null);
      setEditForm({});
      fetchStats();
    } catch (err) {
      console.error("Update error:", err);
      setError("Failed to update transaction");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    try {
      await api.delete(`/api/transactions/${id}`);
      setTransactions(prev => prev.filter(t => t.id !== id));
      fetchStats();
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete transaction");
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} transaction(s)?`)) return;

    try {
      await api.post("/api/transactions/bulk-delete", {
        ids: Array.from(selectedIds)
      });
      setTransactions(prev => prev.filter(t => !selectedIds.has(t.id)));
      setSelectedIds(new Set());
      setSelectAll(false);
      fetchStats();
    } catch (err) {
      console.error("Bulk delete error:", err);
      setError("Failed to delete transactions");
    }
  }

  async function handleExport() {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/transactions/export`,
        {
          headers: {
            Authorization: `Bearer ${session?.accessToken}`
          }
        }
      );
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export transactions");
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  function toggleSelectAll() {
    if (selectAll) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map(t => t.id)));
    }
    setSelectAll(!selectAll);
  }

  function startEdit(transaction: Transaction) {
    setEditingId(transaction.id);
    setEditForm({
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date,
      category: transaction.category,
      status: transaction.status,
      notes: transaction.notes
    });
  }

  function applyFilters() {
    setTransactions([]);
    setCursor(null);
    fetchTransactions(null, true);
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "verified":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "flagged":
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-600" />;
    }
  }

  function getStatusBadge(status: string) {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      verified: "bg-green-100 text-green-800",
      flagged: "bg-red-100 text-red-800"
    };
    return colors[status as keyof typeof colors] || colors.pending;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-500 mt-1">Parse and manage your bank statements</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={() => setShowStats(!showStats)}
          >
            <BarChart3 className="w-4 h-4" />
            {showStats ? "Hide" : "Show"} Analytics
          </Button>
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleExport}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Dashboard */}
      {showStats && stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">Total Transactions</div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">Total Income</div>
            <div className="text-2xl font-bold text-green-600">
              ${stats.income.total.toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">{stats.income.count} transactions</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">Total Expenses</div>
            <div className="text-2xl font-bold text-red-600">
              ${stats.expenses.total.toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">{stats.expenses.count} transactions</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">Net Balance</div>
            <div className={`text-2xl font-bold ${
              stats.income.total - stats.expenses.total >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              ${(stats.income.total - stats.expenses.total).toFixed(2)}
            </div>
          </div>
        </div>
      )}

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

      {/* Filters & Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-50 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <select
            aria-label="Filter by category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-opacity-20 outline-none"
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-opacity-20 outline-none capitalize"
          >
            {STATUSES.map(status => (
              <option key={status} value={status} className="capitalize">
                {status === "all" ? "All Status" : status}
              </option>
            ))}
          </select>

          <Button onClick={applyFilters} variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Apply Filters
          </Button>

          {selectedIds.size > 0 && (
            <Button 
              onClick={handleBulkDelete}
              variant="outline"
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-4 text-left">
                  <button onClick={toggleSelectAll} className="hover:bg-gray-100 p-1 rounded">
                    {selectAll ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No transactions yet. Import a statement to get started.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4">
                      <button 
                        onClick={() => toggleSelect(t.id)}
                        className="hover:bg-gray-100 p-1 rounded"
                      >
                        {selectedIds.has(t.id) ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                      {editingId === t.id ? (
                        <Input
                          type="date"
                          value={editForm.date?.split('T')[0] || ''}
                          onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                          className="w-32"
                        />
                      ) : (
                        new Date(t.date).toLocaleDateString()
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                      {editingId === t.id ? (
                        <Input
                          value={editForm.description || ''}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        />
                      ) : (
                        <div>
                          <div>{t.description}</div>
                          {t.notes && (
                            <div className="text-xs text-gray-500 mt-1">{t.notes}</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {editingId === t.id ? (
                        <select
                          aria-label="Select category"
                          value={editForm.category || ''}
                          onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                          className="border border-gray-200 rounded px-2 py-1 text-sm"
                        >
                          {CATEGORIES.filter(c => c !== "All Categories").map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {t.category || "Uncategorized"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {editingId === t.id ? (
                        <select
                          aria-label="Select status"
                          value={editForm.status || ''}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          className="border border-gray-200 rounded px-2 py-1 text-sm capitalize"
                        >
                          <option value="pending">Pending</option>
                          <option value="verified">Verified</option>
                          <option value="flagged">Flagged</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(t.status)}`}>
                          {getStatusIcon(t.status)}
                          {t.status}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-right whitespace-nowrap">
                      {editingId === t.id ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editForm.amount || ''}
                          onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) })}
                          className="w-28 text-right"
                        />
                      ) : (
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
                      )}
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
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      {editingId === t.id ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleUpdate(t.id)}
                            className="text-green-600 hover:text-green-800 p-1"
                            aria-label="Save changes"
                            title="Save changes"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditForm({});
                            }}
                            className="text-red-600 hover:text-red-800 p-1"
                            aria-label="Cancel editing"
                            title="Cancel editing"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEdit(t)}
                            className="text-blue-600 hover:text-blue-800 p-1"
                            aria-label="Edit transaction"
                            title="Edit transaction"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                            aria-label="Delete transaction"
                            title="Delete transaction"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
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
