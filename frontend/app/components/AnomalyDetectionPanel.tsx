"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, 
  Shield, 
  TrendingUp, 
  Activity, 
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2
} from "lucide-react";

interface Anomaly {
  id: string;
  amount: number;
  description: string;
  date: string;
  category: string | null;
  anomalyScore: number;
  anomalyReasons: string[];
  isAnomaly: boolean;
}

interface AnomalyStats {
  totalTransactions: number;
  anomalyCount: number;
  anomalyRate: string; // Backend returns "5.00%" format
  averageScore: number | string;
  topReasons: [string, number][];
}

export default function AnomalyDetectionPanel() {
  const { data: session } = useSession();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [stats, setStats] = useState<AnomalyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAnomalies();
  }, [session]);

  async function fetchAnomalies() {
    try {
      setLoading(true);
      setError("");
      
      // Fetch stats from the correct endpoint
      const statsRes = await api.get<AnomalyStats>("/api/anomalies/stats");
      setStats(statsRes.data || null);
      
      // Fetch anomalies directly from the new list endpoint
      const anomalyRes = await api.get<{ data: Anomaly[], count: number }>("/api/anomalies/list");
      setAnomalies(anomalyRes.data?.data || []);
    } catch (err) {
      console.error("Failed to fetch anomalies:", err);
      setError("Failed to load anomaly data");
      setAnomalies([]);
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    try {
      setScanning(true);
      setError("");
      
      // Use the new /scan endpoint which runs detection on ALL transactions
      const result = await api.post<{ 
        success: boolean; 
        scanned: number; 
        anomaliesFound: number; 
        message: string 
      }>("/api/anomalies/scan", {});
      
      console.log("Scan result:", result.data);
      
      // Refresh the data
      await fetchAnomalies();
    } catch (err) {
      console.error("Scan failed:", err);
      setError("Anomaly scan failed. Please try again.");
    } finally {
      setScanning(false);
    }
  }

  async function dismissAnomaly(id: string) {
    // Since there's no dismiss endpoint, just remove from local state
    setAnomalies(prev => prev.filter(a => a.id !== id));
  }

  function getSeverityColor(score: number) {
    if (score >= 3) return { bg: "bg-red-100", text: "text-red-700", icon: "text-red-500" };
    if (score >= 2) return { bg: "bg-orange-100", text: "text-orange-700", icon: "text-orange-500" };
    return { bg: "bg-yellow-100", text: "text-yellow-700", icon: "text-yellow-500" };
  }

  function getSeverityLabel(score: number) {
    if (score >= 3) return "High Risk";
    if (score >= 2) return "Medium Risk";
    return "Low Risk";
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Anomaly Detection</h3>
            <p className="text-xs sm:text-sm text-gray-500">AI-powered fraud & unusual activity detection</p>
          </div>
        </div>
        <Button variant="outline" onClick={runScan} disabled={scanning} className="gap-2 w-full sm:w-auto">
          {scanning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Run Scan
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 sm:p-4">
            <div className="flex items-center gap-1 sm:gap-2 text-blue-600 mb-1">
              <Activity className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm font-medium">Scanned</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-blue-900">{stats.totalTransactions}</p>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-3 sm:p-4">
            <div className="flex items-center gap-1 sm:gap-2 text-red-600 mb-1">
              <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm font-medium">Anomalies</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-red-900">{stats.anomalyCount}</p>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3 sm:p-4">
            <div className="flex items-center gap-1 sm:gap-2 text-orange-600 mb-1">
              <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm font-medium">Rate</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-orange-900">{stats.anomalyRate || '0%'}</p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3 sm:p-4">
            <div className="flex items-center gap-1 sm:gap-2 text-green-600 mb-1">
              <Shield className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm font-medium">Avg Score</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-green-900">{stats.averageScore ?? 0}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      {/* Anomaly List */}
      {anomalies.length === 0 ? (
        <div className="text-center py-8">
          <Shield className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <h4 className="text-lg font-medium text-gray-900 mb-1">All Clear!</h4>
          <p className="text-gray-500">No anomalies detected in your transactions</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">Detected Anomalies ({anomalies.length})</h4>
          {anomalies.map(anomaly => {
            const severity = getSeverityColor(anomaly.anomalyScore);
            const isExpanded = expanded === anomaly.id;
            
            return (
              <div key={anomaly.id} className={`border rounded-lg overflow-hidden ${severity.bg}`}>
                <div 
                  className="p-3 sm:p-4 cursor-pointer hover:bg-opacity-80 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : anomaly.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                      <AlertTriangle className={`w-4 h-4 sm:w-5 sm:h-5 mt-0.5 shrink-0 ${severity.icon}`} />
                      <div className="min-w-0">
                        <p className={`font-medium text-sm sm:text-base ${severity.text} truncate`}>{anomaly.description}</p>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1">
                          {new Date(anomaly.date).toLocaleDateString()} • {anomaly.category || "Uncategorized"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="text-right">
                        <p className={`text-base sm:text-lg font-bold ${severity.text}`}>
                          ${Math.abs(anomaly.amount).toFixed(2)}
                        </p>
                        <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${severity.bg} ${severity.text} font-medium`}>
                          {getSeverityLabel(anomaly.anomalyScore)}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-gray-200">
                    <p className="text-xs font-medium text-gray-500 mb-2">Detection Reasons:</p>
                    <ul className="space-y-1 mb-4">
                      {anomaly.anomalyReasons.map((reason, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); dismissAnomaly(anomaly.id); }}
                      >
                        Dismiss
                      </Button>
                      <Button size="sm" variant="destructive">
                        Report Fraud
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
