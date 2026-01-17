"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Image from "next/image";

function MCPAuthorizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "authorizing" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const redirectUri = searchParams.get("redirect_uri");
    const state = searchParams.get("state");
    const codeChallenge = searchParams.get("code_challenge");
    const codeChallengeMethod = searchParams.get("code_challenge_method");
    const client = searchParams.get("client_id") || "mcp";

    if (!redirectUri) {
      setStatus("error");
      setError("Missing redirect_uri parameter");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Redirect to login with return URL
        const returnUrl = encodeURIComponent(window.location.href);
        router.push(`/login?returnUrl=${returnUrl}`);
        return;
      }

      setStatus("authorizing");

      try {
        // Get Firebase token
        const token = await user.getIdToken(true);

        // Create OAuth authorization code via backend
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mcp/oauth/code`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
            client: client,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to create authorization code");
        }

        const data = await response.json();
        const code = data.code;

        // Build redirect URL with code
        const redirectUrl = new URL(redirectUri);
        redirectUrl.searchParams.set("code", code);
        if (state) {
          redirectUrl.searchParams.set("state", state);
        }

        setStatus("success");

        // Redirect back to the MCP client
        setTimeout(() => {
          window.location.href = redirectUrl.toString();
        }, 1000);

      } catch (err: any) {
        console.error("Authorization error:", err);
        setStatus("error");
        setError(err.message || "Authorization failed");
      }
    });

    return () => unsubscribe();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4">
      <Image 
        src="/Unimemory Name Logo NoBG.png" 
        alt="UniMemory" 
        width={280} 
        height={80} 
        className="mb-12"
        priority
      />

      {status === "loading" && (
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-neutral-200 border-t-neutral-900 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-neutral-600">Loading...</p>
        </div>
      )}

      {status === "authorizing" && (
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-neutral-200 border-t-neutral-900 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-neutral-600">Authorizing MCP connection...</p>
          <p className="text-sm text-neutral-400 mt-2">This will give your AI assistant access to your memories</p>
        </div>
      )}

      {status === "success" && (
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xl font-semibold text-neutral-900 mb-2">Connected!</p>
          <p className="text-sm text-neutral-500">Redirecting back to your MCP client...</p>
        </div>
      )}

      {status === "error" && (
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-xl font-semibold text-neutral-900 mb-2">Authorization Failed</p>
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800"
          >
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}

export default function MCPAuthorizePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Image 
          src="/Unimemory Name Logo NoBG.png" 
          alt="UniMemory" 
          width={280} 
          height={80} 
          className="mb-12"
          priority
        />
        <div className="w-8 h-8 border-4 border-neutral-200 border-t-neutral-900 rounded-full animate-spin"></div>
      </div>
    }>
      <MCPAuthorizeContent />
    </Suspense>
  );
}
