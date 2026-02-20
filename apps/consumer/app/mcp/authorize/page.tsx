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
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <Image
        src="/Unimemory Name Logo NoBG.png"
        alt="UniMemory"
        width={280}
        height={80}
        className="mb-12"
        priority
      />

      {status === "loading" && (
        <p className="text-2xl text-neutral-700">Connecting to UniMemory...</p>
      )}

      {status === "authorizing" && (
        <p className="text-2xl text-neutral-700">Authorizing MCP connection...</p>
      )}

      {status === "success" && (
        <p className="text-2xl text-green-600 font-medium">Connected ✓</p>
      )}

      {status === "error" && (
        <>
          <p className="text-2xl text-red-600">Authorization failed. Please try again.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-8 px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800"
          >
            Go to Dashboard
          </button>
        </>
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
        <p className="text-2xl text-neutral-700">Loading...</p>
      </div>
    }>
      <MCPAuthorizeContent />
    </Suspense>
  );
}
