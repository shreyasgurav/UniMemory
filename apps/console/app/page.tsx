"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, signInWithGoogle } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [activeTab, setActiveTab] = useState<'typescript' | 'python'>('typescript');

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
    <div className="bg-gray-50 min-h-screen flex flex-col">
      {/* Header - Liquid Glass Effect */}
      <header className="px-6 py-4 sticky top-0 z-50 glass-nav">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/Unimemory Name Logo NoBG.png" 
              alt="UniMemory" 
              className="h-8 w-auto"
            />
          </div>
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-all flex items-center gap-2 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
          >
            {signingIn ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-3xl text-center animate-fade-in">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 mb-6 leading-tight">
            AI memory for your
            <span className="block bg-gradient-to-r from-neutral-900 via-neutral-700 to-neutral-900 bg-clip-text text-transparent">
              applications
            </span>
          </h1>
          
          <p className="text-lg text-neutral-500 mb-10 max-w-xl mx-auto leading-relaxed">
            Add intelligent memory to any application with a few lines of code. 
            Extract, store, and search memories automatically.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="px-6 py-3 text-white font-medium rounded-xl disabled:opacity-50 transition-all flex items-center gap-2 text-base hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #000000, #5b5b5b)' }}
            >
              {signingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Get started
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
            <a
              href="https://github.com/shreyasgurav/UniMemory"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-white text-neutral-900 font-medium rounded-xl border border-neutral-200 hover:bg-neutral-50 transition-all flex items-center gap-2 text-base"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              View on GitHub
            </a>
          </div>

          {/* Code Example - Tabbed Dark Terminal */}
          <div className="bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden text-left max-w-2xl mx-auto">
            {/* Tab Bar */}
            <div className="flex items-center border-b border-neutral-700">
              <button
                onClick={() => setActiveTab('typescript')}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'typescript'
                    ? 'text-amber-400 border-b-2 border-amber-400 bg-neutral-800'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                TypeScript
              </button>
              <button
                onClick={() => setActiveTab('python')}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'python'
                    ? 'text-amber-400 border-b-2 border-amber-400 bg-neutral-800'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Python
              </button>
              {/* Copy button */}
              <button
                onClick={() => {
                  const code = activeTab === 'typescript' 
                    ? `npm install unimemory\n\nimport Unimemory from 'unimemory';\n\nconst client = new Unimemory();\n\nawait client.memories.add({\n  containerTag: userId,\n  content: "user booked flight Frontier F91098",\n});\n\nconst result = await client.memories.search({\n  containerTag: userId,\n  q: "what are the flight preferences?"\n});`
                    : `pip install unimemory\n\nfrom unimemory import Unimemory\n\nclient = Unimemory()\n\nclient.memories.add(\n  container_tag=user_id,\n  content="user booked flight Frontier F91098",\n)\n\nresult = client.memories.search(\n  container_tag=user_id,\n  q="what are the flight preferences?"\n)`;
                  navigator.clipboard.writeText(code);
                }}
                className="ml-auto mr-4 p-2 text-neutral-400 hover:text-white transition-colors"
                title="Copy code"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            
            {/* Code Content */}
            <pre className="p-6 overflow-x-auto">
              {activeTab === 'typescript' && (
                <code className="text-sm font-mono leading-relaxed">
                  <span className="text-neutral-500">$ </span><span className="text-white">npm install unimemory</span>{'\n\n'}
                  <span className="text-purple-400">import</span> <span className="text-amber-300">Unimemory</span> <span className="text-purple-400">from</span> <span className="text-green-400">'unimemory'</span><span className="text-neutral-400">;</span>{'\n\n'}
                  <span className="text-purple-400">const</span> <span className="text-blue-300">client</span> <span className="text-neutral-400">=</span> <span className="text-purple-400">new</span> <span className="text-amber-300">Unimemory</span><span className="text-neutral-400">();</span>{'\n\n'}
                  <span className="text-purple-400">await</span> <span className="text-blue-300">client</span><span className="text-neutral-400">.</span><span className="text-blue-300">memories</span><span className="text-neutral-400">.</span><span className="text-amber-300">add</span><span className="text-neutral-400">({"{"}</span>{'\n'}
                  <span className="text-neutral-400">    </span><span className="text-blue-300">containerTag</span><span className="text-neutral-400">:</span>  <span className="text-blue-300">userId</span><span className="text-neutral-400">,</span>{'\n'}
                  <span className="text-neutral-400">    </span><span className="text-blue-300">content</span><span className="text-neutral-400">:</span> <span className="text-green-400">"user booked flight Frontier F91098"</span><span className="text-neutral-400">,</span>{'\n'}
                  <span className="text-neutral-400">{"})"}</span><span className="text-neutral-400">;</span>{'\n\n'}
                  <span className="text-purple-400">const</span> <span className="text-blue-300">result</span> <span className="text-neutral-400">=</span> <span className="text-purple-400">await</span> <span className="text-blue-300">client</span><span className="text-neutral-400">.</span><span className="text-blue-300">memories</span><span className="text-neutral-400">.</span><span className="text-amber-300">search</span><span className="text-neutral-400">({"{"}</span>{'\n'}
                  <span className="text-neutral-400">    </span><span className="text-blue-300">containerTag</span><span className="text-neutral-400">:</span> <span className="text-blue-300">userId</span><span className="text-neutral-400">,</span>{'\n'}
                  <span className="text-neutral-400">    </span><span className="text-blue-300">q</span><span className="text-neutral-400">:</span> <span className="text-green-400">"what are the flight preferences?"</span>{'\n'}
                  <span className="text-neutral-400">{"})"}</span><span className="text-neutral-400">;</span>{'\n'}
                  <span className="text-neutral-500">// "User usually flies Frontier, prefers</span>{'\n'}
                  <span className="text-neutral-500">// morning departures, ~$100 budget"</span>
                </code>
              )}
              {activeTab === 'python' && (
                <code className="text-sm font-mono leading-relaxed">
                  <span className="text-neutral-500">$ </span><span className="text-white">pip install unimemory</span>{'\n\n'}
                  <span className="text-purple-400">from</span> <span className="text-blue-300">unimemory</span> <span className="text-purple-400">import</span> <span className="text-amber-300">Unimemory</span>{'\n\n'}
                  <span className="text-blue-300">client</span> <span className="text-neutral-400">=</span> <span className="text-amber-300">Unimemory</span><span className="text-neutral-400">()</span>{'\n\n'}
                  <span className="text-blue-300">client</span><span className="text-neutral-400">.</span><span className="text-blue-300">memories</span><span className="text-neutral-400">.</span><span className="text-amber-300">add</span><span className="text-neutral-400">(</span>{'\n'}
                  <span className="text-neutral-400">    </span><span className="text-blue-300">container_tag</span><span className="text-neutral-400">=</span><span className="text-blue-300">user_id</span><span className="text-neutral-400">,</span>{'\n'}
                  <span className="text-neutral-400">    </span><span className="text-blue-300">content</span><span className="text-neutral-400">=</span><span className="text-green-400">"user booked flight Frontier F91098"</span><span className="text-neutral-400">,</span>{'\n'}
                  <span className="text-neutral-400">)</span>{'\n\n'}
                  <span className="text-blue-300">result</span> <span className="text-neutral-400">=</span> <span className="text-blue-300">client</span><span className="text-neutral-400">.</span><span className="text-blue-300">memories</span><span className="text-neutral-400">.</span><span className="text-amber-300">search</span><span className="text-neutral-400">(</span>{'\n'}
                  <span className="text-neutral-400">    </span><span className="text-blue-300">container_tag</span><span className="text-neutral-400">=</span><span className="text-blue-300">user_id</span><span className="text-neutral-400">,</span>{'\n'}
                  <span className="text-neutral-400">    </span><span className="text-blue-300">q</span><span className="text-neutral-400">=</span><span className="text-green-400">"what are the flight preferences?"</span>{'\n'}
                  <span className="text-neutral-400">)</span>{'\n'}
                  <span className="text-neutral-500"># "User usually flies Frontier, prefers</span>{'\n'}
                  <span className="text-neutral-500"># morning departures, ~$100 budget"</span>
              </code>
              )}
            </pre>
          </div>
        </div>
      </main>

      {/* Footer - Liquid Glass Effect */}
      <footer className="px-6 py-6 glass-nav">
        <div className="border-t border-neutral-900/40 mx-36 mb-6"></div>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img 
              src="/Unimemory Name Logo NoBG.png" 
              alt="UniMemory" 
              className="h-6 w-auto opacity-100"
            />
          </div>
          <div className="flex items-center gap-6 text-sm text-neutral-700">
            <a href="https://github.com/shreyasgurav/UniMemory" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900 transition-colors">
              GitHub
            </a>
            <a href="https://www.npmjs.com/package/unimemory" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900 transition-colors">
              npm
            </a>
            <a href="https://pypi.org/project/unimemory/" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900 transition-colors">
              PyPI
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
