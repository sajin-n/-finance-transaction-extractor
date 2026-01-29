"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Upload, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  X
} from "lucide-react";

interface UploadPasteModalProps {
  onClose: () => void;
  onUploadSuccess: () => void;
  accessToken?: string;
}

export default function UploadPasteModal({ onClose, onUploadSuccess, accessToken }: UploadPasteModalProps) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setSuccess(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/transactions/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed (${res.status})`);
      }

      setSuccess(true);
      setTimeout(() => {
        onUploadSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Upload failed:", err);
      const message = err instanceof Error ? err.message : "Failed to upload file";
      setError(message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handlePasteSubmit() {
    if (!text.trim()) {
      setError("Please paste some transaction data");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/transactions/extract`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Extraction failed (${res.status})`);
      }

      setSuccess(true);
      setText("");
      setTimeout(() => {
        onUploadSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Extraction failed:", err);
      const message = err instanceof Error ? err.message : "Failed to extract transactions";
      setError(message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Add Transactions</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">Upload a file or paste transaction data</p>
          </div>
          <button
            onClick={onClose}
            title="Close modal"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setMode("upload")}
            className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-colors ${
              mode === "upload"
                ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center justify-center gap-1 sm:gap-2">
              <Upload className="w-4 h-4" />
              <span className="hidden xs:inline">Upload</span> File
            </div>
          </button>
          <button
            onClick={() => setMode("paste")}
            className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-colors ${
              mode === "paste"
                ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center justify-center gap-1 sm:gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden xs:inline">Paste</span> Text
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
          {/* Upload Mode */}
          {mode === "upload" && (
            <div className="space-y-3 sm:space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-8 text-center hover:border-indigo-400 transition-colors">
                <Upload className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  <span className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium">
                    {uploading ? (

                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        Choose File
                      </>
                    )}
                  </span>
                </label>
                <p className="text-sm text-gray-500 mt-4">
                  Supported formats: CSV, Excel, PDF, TXT
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Maximum file size: 10MB
                </p>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Supported File Types
                </h4>
                <ul className="text-sm text-blue-700 space-y-1 ml-6 list-disc">
                  <li><strong>CSV:</strong> Standard transaction CSV files</li>
                  <li><strong>Excel:</strong> .xlsx and .xls spreadsheets</li>
                  <li><strong>PDF:</strong> Bank statements in PDF format</li>
                  <li><strong>Text:</strong> Plain text transaction lists</li>
                </ul>
              </div>
            </div>
          )}

          {/* Paste Mode */}
          {mode === "paste" && (
            <div className="space-y-4">
              <div>
                <label htmlFor="pasteText" className="block text-sm font-medium text-gray-700 mb-2">
                  Paste Transaction Data
                </label>
                <textarea
                  id="pasteText"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste your bank statement or transaction list here...&#10;&#10;Example:&#10;2024-01-15  Grocery Store  -45.20&#10;2024-01-16  Salary Deposit  +2500.00&#10;2024-01-17  Electric Bill  -89.50"
                  className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm resize-none"
                  disabled={uploading}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Paste transaction data in any format. Our AI will extract and categorize the transactions.
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-900 mb-2">Tips for Best Results</h4>
                <ul className="text-sm text-green-700 space-y-1 ml-6 list-disc">
                  <li>Include dates, descriptions, and amounts</li>
                  <li>One transaction per line works best</li>
                  <li>Common formats are automatically recognized</li>
                  <li>Both positive and negative amounts are supported</li>
                </ul>
              </div>

              <Button
                onClick={handlePasteSubmit}
                disabled={uploading || !text.trim()}
                className="w-full gap-2"
                size="lg"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Extracting Transactions...
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    Extract Transactions
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Upload Failed</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Success!</p>
                <p className="text-sm mt-1">Transactions have been extracted and added to your account.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
