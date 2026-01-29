"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api, setAuthToken } from "@/lib/api";
import {
  LogOut,
  Upload,
  Download,
  RefreshCw,
  AlertTriangle,
  Shield,
  FileText,
  Sparkles,
  ClipboardCheck,
  TrendingUp,
  Activity,
  Loader2,
  ChevronDown,
  Eye,
  EyeOff,
  Repeat,
  BarChart2,
  Trash2,
  CheckSquare,
  Square,
  X
} from "lucide-react";
import NaturalLanguageQuery from "./components/NaturalLanguageQuery";
import AnomalyDetectionPanel from "./components/AnomalyDetectionPanel";
import MakerCheckerPanel from "./components/MakerCheckerPanel";
import AuditLogViewer from "./components/AuditLogViewer";
import ExportPanel from "./components/ExportPanel";
import UploadPasteModal from "./components/UploadPasteModal";

interface Transaction {
  id: string;
  amount: number;
  description: string;
  date: string;
  category: string | null;
  counterparty: string | null;
  overallConfidence?: number;
  reviewStatus?: string;
  isAnomaly?: boolean;
  anomalyScore?: number;
  anomalyReasons?: string[];
  isRecurring?: boolean;
  recurringPattern?: string;
  hasPII?: boolean;
  maskedDescription?: string;
  [key: string]: unknown; // Index signature for compatibility
}

interface DashboardStats {
  totalTransactions: number;
  totalIncome: number;
  totalExpenses: number;
  pendingReviews: number;
  anomalyCount: number;
  recurringCount: number;
}

type ActivePanel = "nlq" | "anomalies" | "reviews" | "audit" | "export" | null;

export default function EnterpriseDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [showPII, setShowPII] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  
  // Selection state for delete functionality
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<"selected" | "all" | null>(null);

  // Redirect if not authenticated and set auth token
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    // Set auth token when session is available
    if (session?.accessToken) {
      setAuthToken(session.accessToken as string);
    }
  }, [status, router, session?.accessToken]);

  const fetchTransactions = useCallback(async (cursor?: string) => {
    if (!session?.accessToken) return;
    
    // Set auth token before making API call
    setAuthToken(session.accessToken as string);
    
    try {
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      
      const url = cursor ? `/api/transactions?cursor=${cursor}` : "/api/transactions";
      const res = await api.get<{ data: Transaction[]; nextCursor: string | null }>(url);
      const newTxns = res.data?.data || [];
      
      if (cursor) {
        // Append to existing transactions and calculate stats
        setTransactions(prev => {
          const allTxns = [...prev, ...newTxns];
          // Update stats with all transactions
          setStats({
            totalTransactions: allTxns.length,
            totalIncome: allTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
            totalExpenses: allTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
            pendingReviews: allTxns.filter(t => t.reviewStatus === "PENDING").length,
            anomalyCount: allTxns.filter(t => t.isAnomaly).length,
            recurringCount: allTxns.filter(t => t.isRecurring).length,
          });
          return allTxns;
        });
      } else {
        // Replace transactions
        setTransactions(newTxns);
        // Calculate stats from new transactions
        setStats({
          totalTransactions: newTxns.length,
          totalIncome: newTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
          totalExpenses: newTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
          pendingReviews: newTxns.filter(t => t.reviewStatus === "PENDING").length,
          anomalyCount: newTxns.filter(t => t.isAnomaly).length,
          recurringCount: newTxns.filter(t => t.isRecurring).length,
        });
      }
      
      setNextCursor(res.data?.nextCursor || null);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
      if (!cursor) setTransactions([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [session?.accessToken]); // Removed 'transactions' from dependencies to prevent infinite loop

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  function handleUploadSuccess() {
    fetchTransactions();
    setShowUploadModal(false);
  }

  // Selection helpers
  function toggleSelection(id: string) {
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

  function selectAll() {
    setSelectedIds(new Set(transactions.map(t => t.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  // Delete functions
  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    
    try {
      setDeleting(true);
      await api.post("/api/transactions/bulk-delete", { 
        ids: Array.from(selectedIds) 
      });
      
      // Remove deleted transactions from state
      setTransactions(prev => prev.filter(t => !selectedIds.has(t.id)));
      setSelectedIds(new Set());
      setSelectionMode(false);
      setShowDeleteConfirm(null);
      
      // Refresh stats
      fetchTransactions();
    } catch (err) {
      console.error("Failed to delete transactions:", err);
      alert("Failed to delete transactions. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteAll() {
    try {
      setDeleting(true);
      await api.delete("/api/transactions/all");
      
      // Clear all transactions from state
      setTransactions([]);
      setStats(null);
      setShowDeleteConfirm(null);
      
      // Refresh
      fetchTransactions();
    } catch (err) {
      console.error("Failed to delete all transactions:", err);
      alert("Failed to delete transactions. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  function getConfidenceColor(confidence: number) {
    if (confidence >= 0.8) return "bg-green-100 text-green-700";
    if (confidence >= 0.5) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  }

  function getDisplayDescription(t: Transaction): string {
    if (showPII || !t.hasPII) return t.description;
    return t.maskedDescription || t.description;
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-indigo-600 rounded-lg">
                <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm sm:text-lg font-semibold text-gray-900">Vessify</h1>
                <p className="text-[10px] sm:text-xs text-gray-500 hidden sm:block">Transaction Intelligence Platform</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Profile Icon with Hover Tooltip */}
              <div className="relative group">
                <div className="w-8 h-8 sm:w-9 sm:h-9 bg-indigo-100 rounded-full flex items-center justify-center cursor-pointer hover:bg-indigo-200 transition-colors">
                  <span className="text-indigo-600 font-semibold text-sm sm:text-base">
                    {session?.user?.name?.charAt(0)?.toUpperCase() || session?.user?.email?.charAt(0)?.toUpperCase() || "U"}
                  </span>
                </div>
                {/* Hover Tooltip */}
                <div className="absolute right-0 top-full mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="bg-gray-900 text-white rounded-lg shadow-lg px-4 py-3 min-w-[200px]">
                    <div className="absolute -top-2 right-4 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-gray-900"></div>
                    <p className="font-medium text-sm">{session?.user?.name || "User"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{session?.user?.email}</p>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => signOut()} className="gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm">
                <LogOut className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-4 mb-4 sm:mb-8">
            <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-4 shadow-sm border border-gray-200">
              <div className="flex items-center gap-1 sm:gap-2 text-blue-600 mb-0.5 sm:mb-1">
                <BarChart2 className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-[10px] sm:text-xs font-medium">Transactions</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.totalTransactions}</p>
            </div>
            <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-4 shadow-sm border border-gray-200">
              <div className="flex items-center gap-1 sm:gap-2 text-green-600 mb-0.5 sm:mb-1">
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-[10px] sm:text-xs font-medium">Income</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-green-600">${stats.totalIncome.toFixed(0)}</p>
            </div>
            <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-4 shadow-sm border border-gray-200">
              <div className="flex items-center gap-1 sm:gap-2 text-red-600 mb-0.5 sm:mb-1">
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 rotate-180" />
                <span className="text-[10px] sm:text-xs font-medium">Expenses</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-red-600">${stats.totalExpenses.toFixed(0)}</p>
            </div>
            <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-4 shadow-sm border border-gray-200">
              <div className="flex items-center gap-1 sm:gap-2 text-yellow-600 mb-0.5 sm:mb-1">
                <ClipboardCheck className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-[10px] sm:text-xs font-medium">Pending</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-yellow-600">{stats.pendingReviews}</p>
            </div>
            <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-4 shadow-sm border border-gray-200">
              <div className="flex items-center gap-1 sm:gap-2 text-red-600 mb-0.5 sm:mb-1">
                <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-[10px] sm:text-xs font-medium">Anomalies</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-red-600">{stats.anomalyCount}</p>
            </div>
            <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-4 shadow-sm border border-gray-200">
              <div className="flex items-center gap-1 sm:gap-2 text-purple-600 mb-0.5 sm:mb-1">
                <Repeat className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-[10px] sm:text-xs font-medium">Recurring</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-purple-600">{stats.recurringCount}</p>
            </div>
          </div>
        )}

        {/* Action Toolbar */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200 p-2 sm:p-4 mb-4 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Button
                onClick={() => setShowUploadModal(true)}
                className="gap-1.5 sm:gap-2 bg-indigo-600 hover:bg-indigo-700 text-xs sm:text-sm px-2.5 sm:px-4 h-8 sm:h-9"
              >
                <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">Add</span> Transactions
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActivePanel(activePanel === "export" ? null : "export")}
                className={`gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 ${activePanel === "export" ? "bg-blue-50 border-blue-300" : ""}`}
              >
                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className={`w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform ${activePanel === "export" ? "rotate-180" : ""}`} />
              </Button>
              
              <Button variant="outline" size="sm" onClick={() => fetchTransactions()} className="gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              
              {/* Delete Controls */}
              {!selectionMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectionMode(true)}
                    className="gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 hover:border-red-300 hover:text-red-600"
                    disabled={transactions.length === 0}
                  >
                    <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Select</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm("all")}
                    className="gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                    disabled={transactions.length === 0}
                  >
                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Delete All</span>
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs sm:text-sm text-gray-600 px-2">
                    {selectedIds.size} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectedIds.size === transactions.length ? deselectAll : selectAll}
                    className="gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3"
                  >
                    {selectedIds.size === transactions.length ? (
                      <>
                        <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Deselect All</span>
                      </>
                    ) : (
                      <>
                        <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Select All</span>
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm("selected")}
                    className="gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                    disabled={selectedIds.size === 0}
                  >
                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Delete Selected</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exitSelectionMode}
                    className="gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3"
                  >
                    <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Cancel</span>
                  </Button>
                </>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActivePanel(activePanel === "nlq" ? null : "nlq")}
                className={`gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 ${activePanel === "nlq" ? "bg-purple-50 border-purple-300" : ""}`}
              >
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600" />
                <span className="hidden sm:inline">AI Search</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActivePanel(activePanel === "anomalies" ? null : "anomalies")}
                className={`gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 ${activePanel === "anomalies" ? "bg-red-50 border-red-300" : ""}`}
              >
                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
                <span className="hidden sm:inline">Anomalies</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActivePanel(activePanel === "reviews" ? null : "reviews")}
                className={`gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 ${activePanel === "reviews" ? "bg-indigo-50 border-indigo-300" : ""}`}
              >
                <ClipboardCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
                <span className="hidden sm:inline">Reviews</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActivePanel(activePanel === "audit" ? null : "audit")}
                className={`gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 ${activePanel === "audit" ? "bg-slate-100 border-slate-300" : ""}`}
              >
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />
                <span className="hidden sm:inline">Audit</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPII(!showPII)}
                className="gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3"
              >
                {showPII ? <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                <span className="hidden sm:inline">{showPII ? "Hide PII" : "Show PII"}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Active Panel */}
        {activePanel === "export" && (
          <div className="mb-8 flex justify-center">
            <ExportPanel 
              transactions={transactions} 
              onClose={() => setActivePanel(null)} 
            />
          </div>
        )}
        
        {activePanel === "nlq" && (
          <div className="mb-8">
            <NaturalLanguageQuery />
          </div>
        )}
        
        {activePanel === "anomalies" && (
          <div className="mb-8">
            <AnomalyDetectionPanel />
          </div>
        )}
        
        {activePanel === "reviews" && (
          <div className="mb-8">
            <MakerCheckerPanel onTransactionApproved={() => fetchTransactions()} />
          </div>
        )}
        
        {activePanel === "audit" && (
          <div className="mb-8">
            <AuditLogViewer />
          </div>
        )}

        {/* Transactions Table */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">All Transactions</h2>
          </div>
          
          {/* Mobile Card View */}
          <div className="block sm:hidden divide-y divide-gray-200">
            {transactions.map(t => (
              <div 
                key={t.id} 
                className={`p-3 hover:bg-gray-50 ${selectionMode ? 'cursor-pointer' : ''} ${selectedIds.has(t.id) ? 'bg-indigo-50' : ''}`}
                onClick={() => selectionMode && toggleSelection(t.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  {selectionMode && (
                    <div className="mr-3 flex-shrink-0">
                      {selectedIds.has(t.id) ? (
                        <CheckSquare className="w-5 h-5 text-indigo-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{getDisplayDescription(t)}</p>
                    <p className="text-xs text-gray-500">{new Date(t.date).toLocaleDateString()}</p>
                  </div>
                  <p className={`text-sm font-bold ml-2 ${t.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {t.amount >= 0 ? "+" : "-"}${Math.abs(t.amount).toFixed(2)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-800 rounded-full">
                    {t.category || "Uncategorized"}
                  </span>
                  {t.overallConfidence !== undefined && (
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${getConfidenceColor(t.overallConfidence)}`}>
                      {(t.overallConfidence * 100).toFixed(0)}%
                    </span>
                  )}
                  {t.reviewStatus === "PENDING" && (
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>
                  )}
                  {t.isAnomaly && (
                    <span className="p-0.5 bg-red-100 rounded"><AlertTriangle className="w-3 h-3 text-red-600" /></span>
                  )}
                  {t.isRecurring && (
                    <span className="p-0.5 bg-purple-100 rounded"><Repeat className="w-3 h-3 text-purple-600" /></span>
                  )}
                </div>
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="p-8 text-center">
                <Upload className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No transactions yet</p>
                <p className="text-xs text-gray-400">Upload a statement to get started</p>
              </div>
            )}
          </div>
          
          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {selectionMode && (
                    <th className="px-4 lg:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      <button
                        onClick={selectedIds.size === transactions.length ? deselectAll : selectAll}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {selectedIds.size === transactions.length ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </th>
                  )}
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-4 lg:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 lg:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Confidence</th>
                  <th className="px-4 lg:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Status</th>
                  <th className="px-4 lg:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transactions.map(t => (
                  <tr 
                    key={t.id} 
                    className={`hover:bg-gray-50 ${selectionMode ? 'cursor-pointer' : ''} ${selectedIds.has(t.id) ? 'bg-indigo-50' : ''}`}
                    onClick={() => selectionMode && toggleSelection(t.id)}
                  >
                    {selectionMode && (
                      <td className="px-4 lg:px-6 py-3 lg:py-4 text-center">
                        {selectedIds.has(t.id) ? (
                          <CheckSquare className="w-5 h-5 text-indigo-600 mx-auto" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                    )}
                    <td className="px-4 lg:px-6 py-3 lg:py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(t.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 lg:px-6 py-3 lg:py-4">
                      <div className="text-sm text-gray-900 max-w-[200px] lg:max-w-none truncate lg:whitespace-normal" title={getDisplayDescription(t)}>
                        {getDisplayDescription(t)}
                      </div>
                      {t.counterparty && (
                        <div className="text-xs text-gray-500">{t.counterparty}</div>
                      )}
                    </td>
                    <td className="px-4 lg:px-6 py-3 lg:py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {t.category || "Uncategorized"}
                      </span>
                    </td>
                    <td className={`px-4 lg:px-6 py-3 lg:py-4 whitespace-nowrap text-sm text-right font-medium ${
                      t.amount >= 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      ${Math.abs(t.amount).toFixed(2)}
                    </td>
                    <td className="px-4 lg:px-6 py-3 lg:py-4 whitespace-nowrap text-center hidden md:table-cell">
                      {t.overallConfidence !== undefined && (
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          getConfidenceColor(t.overallConfidence)
                        }`}>
                          {(t.overallConfidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 lg:px-6 py-3 lg:py-4 whitespace-nowrap text-center hidden lg:table-cell">
                      {t.reviewStatus === "pending" ? (
                        <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                          Pending
                        </span>
                      ) : t.reviewStatus === "approved" ? (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                          Approved
                        </span>
                      ) : t.reviewStatus === "rejected" ? (
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                          Rejected
                        </span>
                      ) : t.reviewStatus === "auto_approved" ? (
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                          Auto
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 lg:px-6 py-3 lg:py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1">
                        {t.isAnomaly ? (
                          <span className="p-1 bg-red-100 rounded" title={`Anomaly: ${t.anomalyReasons?.join(", ") || "Detected"}`}>
                            <AlertTriangle className="w-3 h-3 lg:w-4 lg:h-4 text-red-600" />
                          </span>
                        ) : null}
                        {t.isRecurring ? (
                          <span className="p-1 bg-purple-100 rounded" title={`Recurring: ${t.recurringPattern || "Detected"}`}>
                            <Repeat className="w-3 h-3 lg:w-4 lg:h-4 text-purple-600" />
                          </span>
                        ) : null}
                        {t.hasPII ? (
                          <span className="p-1 bg-orange-100 rounded" title="Contains PII">
                            <Shield className="w-3 h-3 lg:w-4 lg:h-4 text-orange-600" />
                          </span>
                        ) : null}
                        {!t.isAnomaly && !t.isRecurring && !t.hasPII && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="text-gray-400">
                        <Upload className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-lg font-medium text-gray-500">No transactions yet</p>
                        <p className="text-sm text-gray-400">Upload a statement to get started</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
            
            {/* Load More Button */}
            {nextCursor && (
              <div className="flex justify-center py-3 sm:py-4 border-t border-gray-200">
                <Button
                  onClick={() => fetchTransactions(nextCursor)}
                  disabled={loadingMore}
                  variant="outline"
                  className="px-4 sm:px-6 text-sm"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 mr-2" />
                      Load More
                    </>
                  )}
                </Button>
              </div>
            )}
            
            {/* Transaction Count */}
            {transactions.length > 0 && (
              <div className="text-center py-2 text-xs sm:text-sm text-gray-500 border-t border-gray-100">
                Showing {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
                {nextCursor && " • More available"}
              </div>
            )}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                {showDeleteConfirm === "all" ? "Delete All Transactions" : "Delete Selected Transactions"}
              </h3>
            </div>
            <p className="text-gray-600 mb-6">
              {showDeleteConfirm === "all" 
                ? `Are you sure you want to delete all ${transactions.length} transaction(s)? This action cannot be undone.`
                : `Are you sure you want to delete ${selectedIds.size} selected transaction(s)? This action cannot be undone.`
              }
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={showDeleteConfirm === "all" ? deleteAll : deleteSelected}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Upload/Paste Modal */}
      {showUploadModal && (
        <UploadPasteModal
          onClose={() => setShowUploadModal(false)}
          onUploadSuccess={handleUploadSuccess}
          accessToken={session?.accessToken as string}
        />
      )}
    </div>
  );
}
