"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  FileText, 
  Clock, 
  User, 
  Activity, 
  Filter, 
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  Trash,
  Plus,
  Upload
} from "lucide-react";

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  user: { name: string; email: string };
  changes: Record<string, { before: unknown; after: unknown }> | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
}

interface AuditFilters {
  action: string;
  entityType: string;
  userId: string;
  startDate: string;
  endDate: string;
}

const ACTION_ICONS: Record<string, typeof Eye> = {
  VIEW: Eye,
  CREATE: Plus,
  UPDATE: Edit,
  DELETE: Trash,
  EXPORT: Download,
  IMPORT: Upload,
};

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  VIEW: { bg: "bg-blue-100", text: "text-blue-700" },
  CREATE: { bg: "bg-green-100", text: "text-green-700" },
  UPDATE: { bg: "bg-yellow-100", text: "text-yellow-700" },
  DELETE: { bg: "bg-red-100", text: "text-red-700" },
  EXPORT: { bg: "bg-purple-100", text: "text-purple-700" },
  IMPORT: { bg: "bg-indigo-100", text: "text-indigo-700" },
};

export default function AuditLogViewer() {
  const { data: session } = useSession();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [filters, setFilters] = useState<AuditFilters>({
    action: "",
    entityType: "",
    userId: "",
    startDate: "",
    endDate: "",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    fetchLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, page]);

  async function fetchLogs() {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: "50" });
      if (filters.action) params.append("action", filters.action);
      if (filters.entityType) params.append("entityType", filters.entityType);
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);

      const res = await api.get<{ data: AuditLogEntry[]; nextCursor: string | null }>(
        `/api/audit/logs?${params}`
      );
      setLogs(res.data?.data || []);
      // Backend uses cursor pagination, not page-based
      setTotalPages(res.data?.nextCursor ? page + 1 : page);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
      setError("Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  async function generateReport() {
    try {
      const res = await api.get<Record<string, unknown>>("/api/audit/compliance-report");
      // Display report data in a new window
      const reportWindow = window.open("", "_blank");
      if (reportWindow) {
        reportWindow.document.write(`
          <html>
            <head><title>Compliance Report</title>
            <style>body{font-family:system-ui;padding:20px;max-width:800px;margin:0 auto}h1{color:#1a1a1a}pre{background:#f5f5f5;padding:15px;border-radius:8px;overflow:auto}</style>
            </head>
            <body>
              <h1>Compliance Report</h1>
              <p>Generated: ${new Date().toLocaleString()}</p>
              <pre>${JSON.stringify(res.data, null, 2)}</pre>
            </body>
          </html>
        `);
      }
    } catch (err) {
      console.error("Failed to generate report:", err);
      setError("Failed to generate compliance report");
    }
  }

  function applyFilters() {
    setPage(1);
    fetchLogs();
  }

  function clearFilters() {
    setFilters({
      action: "",
      entityType: "",
      userId: "",
      startDate: "",
      endDate: "",
    });
    setPage(1);
    fetchLogs();
  }

  function getActionIcon(action: string) {
    const Icon = ACTION_ICONS[action] || Activity;
    return Icon;
  }

  function getActionColor(action: string) {
    return ACTION_COLORS[action] || { bg: "bg-gray-100", text: "text-gray-700" };
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-slate-100 rounded-lg">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Audit Log</h3>
            <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">Track all system activities for compliance</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none"
          >
            <Filter className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Filters</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={generateReport}
            className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none"
          >
            <Download className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Compliance</span> Report
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-50 rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
            <div>
              <label htmlFor="actionFilter" className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1 block">Action</label>
              <select
                id="actionFilter"
                title="Filter by action type"
                value={filters.action}
                onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border rounded-lg bg-white"
              >
                <option value="">All Actions</option>
                <option value="VIEW">View</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="EXPORT">Export</option>
                <option value="IMPORT">Import</option>
              </select>
            </div>
            <div>
              <label htmlFor="entityTypeFilter" className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1 block">Entity Type</label>
              <select
                id="entityTypeFilter"
                title="Filter by entity type"
                value={filters.entityType}
                onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border rounded-lg bg-white"
              >
                <option value="">All Types</option>
                <option value="TRANSACTION">Transaction</option>
                <option value="USER">User</option>
                <option value="REVIEW">Review</option>
                <option value="BULK_JOB">Bulk Job</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Start Date</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">End Date</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={applyFilters}>Apply Filters</Button>
            <Button size="sm" variant="outline" onClick={clearFilters}>Clear</Button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      {/* Log List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h4 className="text-lg font-medium text-gray-900 mb-1">No Logs Found</h4>
          <p className="text-gray-500">No audit log entries match your filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const ActionIcon = getActionIcon(log.action);
            const colors = getActionColor(log.action);
            const isExpanded = expandedLog === log.id;
            
            return (
              <div 
                key={log.id} 
                className="border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div 
                  className="p-2 sm:p-3 cursor-pointer"
                  onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                >
                  <div className="flex items-start sm:items-center gap-2 sm:gap-4">
                    <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${colors.bg}`}>
                      <ActionIcon className={`w-3 h-3 sm:w-4 sm:h-4 ${colors.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                        <span className={`px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium rounded-full ${colors.bg} ${colors.text}`}>
                          {log.action}
                        </span>
                        <span className="text-xs sm:text-sm text-gray-700 truncate">
                          {log.entityType} #{log.entityId.slice(0, 8)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-[10px] sm:text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <User className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          <span className="truncate max-w-[80px] sm:max-w-none">{log.user.name || log.user.email}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          {new Date(log.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="px-4 pb-4 border-t bg-gray-50">
                    <div className="grid grid-cols-2 gap-4 pt-3 text-sm">
                      <div>
                        <p className="text-xs font-medium text-gray-500">Entity ID</p>
                        <code className="text-xs text-gray-700 font-mono">{log.entityId}</code>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500">User Email</p>
                        <p className="text-xs text-gray-700">{log.user.email}</p>
                      </div>
                      {log.ipAddress && (
                        <div>
                          <p className="text-xs font-medium text-gray-500">IP Address</p>
                          <code className="text-xs text-gray-700 font-mono">{log.ipAddress}</code>
                        </div>
                      )}
                      {log.userAgent && (
                        <div className="col-span-2">
                          <p className="text-xs font-medium text-gray-500">User Agent</p>
                          <code className="text-xs text-gray-700 font-mono truncate block">{log.userAgent}</code>
                        </div>
                      )}
                      {log.changes && (
                        <div className="col-span-2">
                          <p className="text-xs font-medium text-gray-500 mb-1">Changes</p>
                          <pre className="text-xs text-gray-700 bg-white p-2 rounded border overflow-x-auto">
                            {JSON.stringify(log.changes, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 sm:pt-4 border-t">
          <p className="text-xs sm:text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-1 sm:gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="h-7 w-7 sm:h-8 sm:w-8 p-0"
            >
              <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="h-7 w-7 sm:h-8 sm:w-8 p-0"
            >
              <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
