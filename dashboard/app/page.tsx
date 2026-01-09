"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, signInWithGoogle } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

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
    try {
      await signInWithGoogle();
      router.push("/dashboard");
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="font-semibold text-xl">UniMemory</div>
          <button
            onClick={handleSignIn}
            className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Sign in
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center">
          <h1 className="text-4xl font-bold mb-4">
            AI memory for your apps
          </h1>
          <p className="text-gray-500 text-lg mb-8">
            Add intelligent memory to any application with a few lines of code.
            Extract, store, and search memories automatically.
          </p>
          <button
            onClick={handleSignIn}
            className="px-6 py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Get started
          </button>

          {/* Code example */}
          <div className="mt-12 text-left bg-gray-50 rounded-lg p-6 border border-gray-100">
            <div className="text-xs text-gray-400 mb-3">Quick Start</div>
            <pre className="code text-sm overflow-x-auto">
              <code className="text-gray-800">
{`npm install unimemory

import UniMemory from 'unimemory';

const client = new UniMemory({
  apiKey: process.env.UNIMEMORY_API_KEY
});

await client.addMemory({
  content: "User prefers dark mode"
});

const results = await client.search("preferences");`}
              </code>
            </pre>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto text-center text-gray-400 text-sm">
          UniMemory
        </div>
      </footer>
    </div>
  );
}

