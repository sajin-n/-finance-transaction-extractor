"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ExportTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string | null;
  confidence?: number;
  status?: string;
  isAnomaly?: boolean;
  [key: string]: unknown;
}

interface ExportPanelProps {
  transactions: ExportTransaction[];
  onClose?: () => void;
}

export default function ExportPanel({ transactions, onClose }: ExportPanelProps) {
  const { data: session } = useSession();
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [includeAnomalies, setIncludeAnomalies] = useState(true);
  const [includeConfidence, setIncludeConfidence] = useState(true);
  const [dateRange, setDateRange] = useState<"all" | "30" | "90" | "365">("all");

  const filteredTransactions = transactions.filter(t => {
    if (dateRange === "all") return true;
    const days = parseInt(dateRange);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return new Date(t.date) >= cutoff;
  });

  async function handleExportCSV() {
    setExporting("csv");
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
      console.error("Export CSV error:", err);
    } finally {
      setExporting(null);
    }
  }

  function handleExportPDF() {
    setExporting("pdf");
    try {
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(31, 41, 55);
      doc.text("Transaction Report", 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
      doc.text(`Total Transactions: ${filteredTransactions.length}`, 14, 36);
      
      // Calculate totals
      const income = filteredTransactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      const expenses = filteredTransactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      doc.text(`Total Income: $${income.toFixed(2)}`, 14, 42);
      doc.text(`Total Expenses: $${expenses.toFixed(2)}`, 14, 48);
      doc.text(`Net Balance: $${(income - expenses).toFixed(2)}`, 14, 54);

      // Build table data
      const headers = ["Date", "Description", "Category", "Amount", "Status"];
      if (includeConfidence) headers.push("Confidence");
      if (includeAnomalies) headers.push("Flags");

      const data = filteredTransactions.map(t => {
        const row = [
          new Date(t.date).toLocaleDateString(),
          t.description.substring(0, 40) + (t.description.length > 40 ? "..." : ""),
          t.category || "Uncategorized",
          `$${t.amount.toFixed(2)}`,
          t.status || "-"
        ];
        if (includeConfidence) row.push(`${((t.confidence ?? 0) * 100).toFixed(0)}%`);
        if (includeAnomalies) row.push(t.isAnomaly ? "⚠️" : "✓");
        return row;
      });

      // Create table
      autoTable(doc, {
        head: [headers],
        body: data,
        startY: 62,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [31, 41, 55] },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 50 },
          2: { cellWidth: 25 },
          3: { cellWidth: 22, halign: "right" },
          4: { cellWidth: 18 },
        }
      });

      // Category summary on new page
      doc.addPage();
      doc.setFontSize(16);
      doc.setTextColor(31, 41, 55);
      doc.text("Category Summary", 14, 22);

      const categoryTotals = filteredTransactions.reduce((acc, t) => {
        const cat = t.category || "Uncategorized";
        if (!acc[cat]) acc[cat] = { count: 0, total: 0 };
        acc[cat].count++;
        acc[cat].total += t.amount;
        return acc;
      }, {} as Record<string, { count: number; total: number }>);

      const categoryData = Object.entries(categoryTotals)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([cat, data]) => [
          cat,
          data.count.toString(),
          `$${data.total.toFixed(2)}`
        ]);

      autoTable(doc, {
        head: [["Category", "Count", "Total"]],
        body: categoryData,
        startY: 30,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [31, 41, 55] }
      });

      // Save
      doc.save(`transactions-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error("Export PDF error:", err);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Export Transactions</h3>
          <p className="text-sm text-gray-500 mt-1">Download your data in CSV or PDF format</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="dateRange" className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
          <select
            id="dateRange"
            title="Select date range for export"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-opacity-20 outline-none"
          >
            <option value="all">All Time ({transactions.length} transactions)</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="365">Last Year</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Include in Export</label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={includeConfidence}
                onChange={(e) => setIncludeConfidence(e.target.checked)}
                className="rounded border-gray-300"
              />
              Confidence Scores
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={includeAnomalies}
                onChange={(e) => setIncludeAnomalies(e.target.checked)}
                className="rounded border-gray-300"
              />
              Anomaly Flags
            </label>
          </div>
        </div>

        <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
          <strong>{filteredTransactions.length}</strong> transactions will be exported
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={handleExportCSV}
          disabled={exporting !== null}
          className="flex-1 gap-2"
          variant="outline"
        >
          {exporting === "csv" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-4 h-4" />
          )}
          Export CSV
        </Button>
        <Button
          onClick={handleExportPDF}
          disabled={exporting !== null}
          className="flex-1 gap-2"
        >
          {exporting === "pdf" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          Export PDF
        </Button>
      </div>
    </div>
  );
}
