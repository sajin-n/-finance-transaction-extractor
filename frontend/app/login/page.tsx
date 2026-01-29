"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDiagnostic(null);
    setLoading(true);

    // Use redirect: false to capture errors and show diagnostics
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
      callbackUrl: "/"
    } as any);

    setLoading(false);

    // On success, redirect to the callback URL (dashboard/home)
    if (res?.ok && !res?.error) {
      window.location.href = res.url || "/";
      return;
    }

    if (res?.error) {
      setError(res.error as string);
      // Run a diagnostic call to backend to surface HTTP status and body
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const diagRes = await fetch(`${apiBase}/api/auth/custom-sign-in`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        let bodyText: string | null = null;
        const ct = diagRes.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const json = await diagRes.json().catch(() => null);
          bodyText = json ? JSON.stringify(json) : null;
        } else {
          bodyText = await diagRes.text().catch(() => null);
        }

        setDiagnostic(`Backend diagnostic: ${diagRes.status} ${diagRes.statusText}${bodyText ? ` — ${bodyText}` : ""}`);
      } catch (diagErr: any) {
        setDiagnostic(`Diagnostic error: ${diagErr?.message || diagErr}`);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-xl p-8 space-y-6"
        >
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back</h1>
            <p className="text-gray-500 text-sm">Sign in to your account</p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <Button className="w-full py-3 text-base font-semibold" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              <div className="font-semibold">Sign in failed: {error}</div>
              {diagnostic && <div className="mt-2 text-xs">{diagnostic}</div>}
            </div>
          )}

          <p className="text-center text-sm text-gray-600">
            {"Don't have an account? "}
            <Link href="/signup" className="text-blue-600 hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}