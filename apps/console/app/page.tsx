"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, signInWithGoogle } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/dashboard");
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
      router.push("/dashboard");
    } catch (error) {
      console.error("Sign in error:", error);
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center animate-fade-in">
        <img
          src="/Unimemory Name Logo NoBG.png"
          alt="UniMemory"
          className="h-10 w-auto mx-auto mb-8"
        />

        <h1 className="text-2xl font-bold text-neutral-900 mb-2">
          Welcome back
        </h1>
        <p className="text-neutral-500 mb-8">
          Sign in to access your UniMemory console
        </p>

        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="w-full px-4 py-3 text-white font-medium rounded-xl disabled:opacity-50 transition-all flex items-center justify-center gap-2 hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
        >
          {signingIn ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign in with Google
            </>
          )}
        </button>
      </div>

      <p className="mt-8 text-sm text-neutral-400">
        &copy; {new Date().getFullYear()} UniMemory. All rights reserved.
      </p>
    </div>
  );
}
