"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CalendarClock, Repeat, TrendingDown, TrendingUp, Loader2 } from "lucide-react";

interface RecurringGroup {
  groupId: string;
  pattern: string | null;
  averageAmount: number;
  totalSpent: number;
  description: string;
  nextProjectedDate: string | null;
  transactions: Array<{ id: string }>;
}

interface ProjectionItem {
  date: string;
  amount: number;
  description: string;
}

interface RecurringSummaryResponse {
  months: number;
  recurringGroupCount: number;
  groups: RecurringGroup[];
  projection: {
    projectedExpenses: ProjectionItem[];
    projectedIncome: ProjectionItem[];
    totalProjectedExpenses: number;
    totalProjectedIncome: number;
    netProjection: number;
  };
  upcoming30d: {
    projectedExpenses: number;
    projectedIncome: number;
    projectedNet: number;
  };
}

export default function RecurringInsightsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<RecurringSummaryResponse | null>(null);

  useEffect(() => {
    fetchRecurringInsights();
  }, []);

  async function fetchRecurringInsights() {
    try {
      setLoading(true);
      setError("");
      const res = await api.get<RecurringSummaryResponse>("/api/transactions/recurring/summary?months=3");
      setSummary(res.data);
    } catch (err) {
      console.error("Failed to fetch recurring insights:", err);
      setError("Failed to load recurring insights");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
        {error}
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const topGroups = [...summary.groups]
    .sort((a, b) => Math.abs(b.averageAmount) - Math.abs(a.averageAmount))
    .slice(0, 5);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Repeat className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Recurring Insights & Forecast</h3>
          <p className="text-xs sm:text-sm text-gray-500">Subscription/recurring detection with 30-day and 3-month projection</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-purple-50 rounded-lg p-3">
          <p className="text-xs text-purple-700 font-medium">Recurring Groups</p>
          <p className="text-xl font-bold text-purple-900">{summary.recurringGroupCount}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3">
          <p className="text-xs text-red-700 font-medium">30d Expenses</p>
          <p className="text-xl font-bold text-red-900">${summary.upcoming30d.projectedExpenses.toFixed(2)}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-xs text-green-700 font-medium">30d Income</p>
          <p className="text-xl font-bold text-green-900">${summary.upcoming30d.projectedIncome.toFixed(2)}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-blue-700 font-medium">30d Net</p>
          <p className={`text-xl font-bold ${summary.upcoming30d.projectedNet >= 0 ? "text-green-700" : "text-red-700"}`}>
            ${summary.upcoming30d.projectedNet.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700">Top recurring merchants</div>
        {topGroups.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No recurring patterns detected yet.</div>
        ) : (
          <div className="divide-y">
            {topGroups.map((group) => {
              const amount = Math.abs(group.averageAmount);
              const isExpense = group.averageAmount < 0;
              return (
                <div key={group.groupId} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{group.description}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                      <span className="capitalize">{group.pattern || "unknown"}</span>
                      <span>•</span>
                      <span>{group.transactions.length} txns</span>
                      {group.nextProjectedDate && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="w-3 h-3" />
                            Next: {new Date(group.nextProjectedDate).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className={`text-sm font-semibold inline-flex items-center gap-1 ${isExpense ? "text-red-600" : "text-green-600"}`}>
                    {isExpense ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                    ${amount.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
