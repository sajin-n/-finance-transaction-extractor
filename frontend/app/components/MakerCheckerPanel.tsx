"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { 
  ClipboardCheck, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  User, 
  AlertCircle,
  Loader2,
  ChevronRight
} from "lucide-react";

interface PendingReview {
  id: string;
  transactionId: string;
  transaction: {
    id: string;
    amount: number;
    description: string;
    date: string;
    category: string | null;
    counterparty: string | null;
  };
  requestedAt: string;
  requestedBy: { name: string; email: string };
  status: "PENDING" | "APPROVED" | "REJECTED";
}

interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
  myRequests: number;
}

interface MakerCheckerPanelProps {
  onTransactionApproved?: (transactionId: string) => void;
}

export default function MakerCheckerPanel({ onTransactionApproved }: MakerCheckerPanelProps) {
  const { data: session } = useSession();
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchReviews();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeTab]);

  async function fetchReviews() {
    try {
      setLoading(true);
      // Use the correct endpoint - /api/reviews/pending for pending reviews
      const endpoint = activeTab === "pending" ? "/api/reviews/pending" : "/api/reviews/pending";
      const res = await api.get<{ reviews: PendingReview[]; total: number }>(endpoint);
      setReviews(res.data?.reviews || []);
      // Stats need to be calculated from reviews since backend doesn't provide them
      const reviewsData = res.data?.reviews || [];
      setStats({
        pending: reviewsData.length,
        approved: 0,
        rejected: 0,
        myRequests: 0
      });
    } catch (err) {
      console.error("Failed to fetch reviews:", err);
      setError("Failed to load reviews");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(reviewId: string) {
    try {
      setProcessing(reviewId);
      const review = reviews.find(r => r.id === reviewId);
      if (!review) {
        setError("Review not found");
        return;
      }
      // Backend expects transactionId in the URL, not reviewId
      await api.post(`/api/reviews/${review.transactionId}/approve`, { comment: "Approved via dashboard" });
      await fetchReviews();
      if (onTransactionApproved) {
        onTransactionApproved(review.transactionId);
      }
    } catch (err) {
      console.error("Failed to approve:", err);
      setError("Failed to approve transaction");
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject(reviewId: string) {
    try {
      setProcessing(reviewId);
      const review = reviews.find(r => r.id === reviewId);
      if (!review) {
        setError("Review not found");
        return;
      }
      // Backend expects transactionId in the URL, not reviewId
      await api.post(`/api/reviews/${review.transactionId}/reject`, { 
        comment: "Rejected via dashboard",
        reason: "Does not meet approval criteria"
      });
      await fetchReviews();
    } catch (err) {
      console.error("Failed to reject:", err);
      setError("Failed to reject transaction");
    } finally {
      setProcessing(null);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-indigo-100 rounded-lg">
            <ClipboardCheck className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Maker-Checker</h3>
            <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">Review and approve pending transactions</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-yellow-50 rounded-lg">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
            <div>
              <p className="text-[10px] sm:text-xs text-yellow-600 font-medium">Pending</p>
              <p className="text-lg sm:text-xl font-bold text-yellow-900">{stats.pending}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-green-50 rounded-lg">
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            <div>
              <p className="text-[10px] sm:text-xs text-green-600 font-medium">Approved</p>
              <p className="text-lg sm:text-xl font-bold text-green-900">{stats.approved}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-red-50 rounded-lg">
            <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            <div>
              <p className="text-[10px] sm:text-xs text-red-600 font-medium">Rejected</p>
              <p className="text-lg sm:text-xl font-bold text-red-900">{stats.rejected}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-blue-50 rounded-lg">
            <User className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            <div>
              <p className="text-[10px] sm:text-xs text-blue-600 font-medium">My Requests</p>
              <p className="text-lg sm:text-xl font-bold text-blue-900">{stats.myRequests}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
            activeTab === "pending"
              ? "border-indigo-500 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Pending Reviews
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
            activeTab === "history"
              ? "border-indigo-500 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Review History
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Review List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-8">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <h4 className="text-lg font-medium text-gray-900 mb-1">All Caught Up!</h4>
          <p className="text-gray-500">No {activeTab === "pending" ? "pending" : ""} reviews to show</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(review => (
            <div 
              key={review.id} 
              className={`border rounded-lg p-3 sm:p-4 transition-colors ${
                review.status === "PENDING" 
                  ? "border-yellow-200 bg-yellow-50/50" 
                  : review.status === "APPROVED"
                  ? "border-green-200 bg-green-50/50"
                  : "border-red-200 bg-red-50/50"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {review.status === "PENDING" && (
                      <span className="px-2 py-0.5 text-[10px] sm:text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                        Pending Review
                      </span>
                    )}
                    {review.status === "APPROVED" && (
                      <span className="px-2 py-0.5 text-[10px] sm:text-xs font-medium bg-green-100 text-green-800 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Approved
                      </span>
                    )}
                    {review.status === "REJECTED" && (
                      <span className="px-2 py-0.5 text-[10px] sm:text-xs font-medium bg-red-100 text-red-800 rounded-full flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Rejected
                      </span>
                    )}
                    <span className="text-[10px] sm:text-xs text-gray-500">
                      {new Date(review.requestedAt).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <p className="font-medium text-sm sm:text-base text-gray-900 truncate">{review.transaction.description}</p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1 text-xs sm:text-sm text-gray-600">
                    <span>{new Date(review.transaction.date).toLocaleDateString()}</span>
                    {review.transaction.category && (
                      <span className="hidden sm:flex items-center gap-1">
                        <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-gray-300" />
                        {review.transaction.category}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-1 sm:mt-2 truncate">
                    By: {review.requestedBy.name}
                  </p>
                </div>
                
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:ml-4">
                  <p className={`text-lg sm:text-xl font-bold ${
                    review.transaction.amount >= 0 ? "text-green-600" : "text-red-600"
                  }`}>
                    ${Math.abs(review.transaction.amount).toFixed(2)}
                  </p>
                  
                  {review.status === "PENDING" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(review.id)}
                        disabled={processing === review.id}
                        className="text-red-600 border-red-200 hover:bg-red-50 h-8 w-8 p-0 sm:w-auto sm:px-3"
                      >
                        {processing === review.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(review.id)}
                        disabled={processing === review.id}
                        className="bg-green-600 hover:bg-green-700 h-8 px-2 sm:px-3"
                      >
                        {processing === review.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 sm:mr-1" />
                            <span className="hidden sm:inline">Approve</span>
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
