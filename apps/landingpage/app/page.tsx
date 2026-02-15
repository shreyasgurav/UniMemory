"use client";

import { useState } from "react";
import Image from "next/image";

export default function Home() {
    const [activeTab, setActiveTab] = useState<'typescript' | 'python'>('typescript');

    return (
        <div className="bg-black min-h-screen flex flex-col selection:bg-neutral-800 selection:text-white">
            {/* Header - Liquid Glass Effect */}
            <header className="px-6 py-4 sticky top-0 z-50 glass-nav">
                <div className="max-w-7xl mx-auto flex items-center justify-center">
                    <img
                        src="/Unimemory Name Logo NoBG.png"
                        alt="UniMemory"
                        className="h-10 w-auto brightness-0 invert"
                    />
                    {/* Get started - commented out for now
                    <div className="relative group">
                        <button
                            className="px-5 py-2.5 text-black text-sm font-medium rounded-full transition-all flex items-center gap-2 hover:opacity-90 bg-white hover:bg-neutral-200"
                        >
                            Get started
                            <svg className="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        <div className="absolute right-0 mt-2 w-48 bg-[#0c0c0c] border border-neutral-800 rounded-2xl shadow-2xl py-2 px-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 transform origin-top-right scale-95 group-hover:scale-100">
                            <a
                                href="http://localhost:3000"
                                className="block px-4 py-2.5 rounded-xl hover:bg-neutral-900 transition-all group/item"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-white">Unimemory App</span>
                                    <span className="text-neutral-600 transition-transform group-hover/item:translate-x-1">→</span>
                                </div>
                            </a>
                            <a
                                href="#"
                                className="block px-4 py-2.5 rounded-xl hover:bg-neutral-900 transition-all group/item mt-0.5"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-white">Memory API</span>
                                    <span className="text-neutral-600 transition-transform group-hover/item:translate-x-1">→</span>
                                </div>
                            </a>
                        </div>
                    </div>
                    */}
                </div>
            </header>

            {/* Hero */}
            <main className="flex-1 flex flex-col items-center pt-24 pb-16 px-6 relative overflow-hidden">

                <div className="max-w-6xl w-full text-center relative z-10">
                    {/* Title in single row */}
                    <div className="flex justify-center mb-8">
                        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tighter text-neutral-200 text-center bg-transparent font-geometric drop-shadow-2xl max-w-4xl mx-auto leading-[1.1]">
                            Unified <span className="bg-clip-text text-transparent bg-[linear-gradient(to_right,#818cf8,#c084fc,#f472b6,#fbbf24,#818cf8)] bg-[length:200%_auto] animate-shimmer">memory</span> for all your AI Agents.
                        </h1>
                    </div>

                    <p className="text-xl text-neutral-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                        UniMemory gives your AI a shared memory.
                        Save important context once and use it across ChatGPT, Claude, Cursor, and more.
                    </p>


                    {/* Solar System Image */}
                    <div className="relative w-full max-w-2xl mx-auto mb-16 animate-fade-in group select-none">
                        <img
                            src="/Unimemory Solar system.png"
                            alt="UniMemory Ecosystem"
                            className="w-full h-auto object-contain pointer-events-none"
                            draggable={false}
                            style={{
                                maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
                                WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)'
                            }}
                        />
                    </div>

                    {/* Code Example (TypeScript / Python tabs) - commented out
                    <div className="bg-[#0f0f0f] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden text-left max-w-3xl mx-auto">
                        <div className="flex items-center border-b border-neutral-800 bg-[#161616] px-2">
                            <div className="flex gap-1.5 px-4">
                                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                            </div>
                            <button onClick={() => setActiveTab('typescript')} ...>TypeScript</button>
                            <button onClick={() => setActiveTab('python')} ...>Python</button>
                            <button ...>Copy</button>
                        </div>
                        <pre>... npm install unimemory / pip install unimemory + code ...</pre>
                    </div>
                    */}
                </div>
            </main>

            {/* Footer - Liquid Glass Effect */}
            <footer className="px-6 py-6 glass-nav-footer">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <img
                            src="/Unimemory Name Logo NoBG.png"
                            alt="UniMemory"
                            className="h-8 w-auto opacity-80 hover:opacity-100 transition-opacity brightness-0 invert"
                        />
                    </div>
                    <div className="flex items-center gap-6 text-sm text-neutral-400">
                        <a href="/privacy" className="hover:text-white transition-colors">
                            Privacy
                        </a>
                        <a href="/terms" className="hover:text-white transition-colors">
                            Terms
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
