"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, signInWithGoogle, handleRedirectResult } from "@/lib/firebase";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    handleRedirectResult().catch(console.error);
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/");
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
    } catch (error) {
      console.error("Sign in error:", error);
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="max-w-md w-full">
          {/* Logo */}
          <div className="mb-12">
            <img 
              src="/Unimemory Name Logo NoBG.png" 
              alt="UniMemory" 
              className="h-8 w-auto"
            />
          </div>

          {/* Separator Line */}
          <div className="w-16 h-px bg-neutral-200 mb-12"></div>

          {/* Sign In Button */}
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white border border-neutral-200 rounded-xl text-neutral-700 font-medium hover:bg-neutral-50 transition-colors disabled:opacity-50 shadow-sm"
          >
            {signingIn ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {signingIn ? "Signing in..." : "Sign in with Google"}
          </button>

          {/* Terms */}
          <p className="text-xs text-neutral-400 mt-8">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>

      {/* Right Side - Orbital Design */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden bg-black">
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Orbital Rings */}
          <div className="relative w-[600px] h-[600px]">
            {/* Ring 1 - Innermost */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[200px] h-[200px] rounded-full border border-neutral-800"></div>
            </div>
            
            {/* Ring 2 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[350px] h-[350px] rounded-full border border-neutral-800"></div>
            </div>
            
            {/* Ring 3 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[500px] h-[500px] rounded-full border border-neutral-800"></div>
            </div>
            
            {/* Ring 4 - Outermost */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[600px] h-[600px] rounded-full border border-neutral-800"></div>
            </div>

            {/* Center - UniMemory Logo */}
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="w-36 h-36 bg-neutral-900 rounded-full flex items-center justify-center border-2 border-neutral-700 shadow-2xl">
                <img 
                  src="/unimemory-white.png" 
                  alt="UniMemory" 
                  className="w-24 h-auto"
                />
              </div>
            </div>

            {/* AI Company Logos on Orbits */}
            {/* Ring 2 - 2 logos (radius 175px) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="absolute w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg" style={{ transform: 'translate(0px, -175px) translate(-50%, -50%)' }}>
                <img src="https://chat.openai.com/favicon.ico" alt="ChatGPT" className="w-9 h-9 object-contain" />
              </div>
              <div className="absolute w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg" style={{ transform: 'translate(0px, 175px) translate(-50%, -50%)' }}>
                <img src="https://claude.ai/favicon.ico" alt="Claude" className="w-9 h-9 object-contain" />
              </div>
            </div>

            {/* Ring 3 - 4 logos (radius 250px) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="absolute w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg" style={{ transform: 'translate(0px, -250px) translate(-50%, -50%)' }}>
                <img src="https://gemini.google.com/favicon.ico" alt="Gemini" className="w-9 h-9 object-contain" />
              </div>
              <div className="absolute w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg" style={{ transform: 'translate(250px, 0px) translate(-50%, -50%)' }}>
                <img src="https://www.perplexity.ai/favicon.ico" alt="Perplexity" className="w-9 h-9 object-contain" />
              </div>
              <div className="absolute w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg" style={{ transform: 'translate(0px, 250px) translate(-50%, -50%)' }}>
                <img src="https://you.com/favicon.ico" alt="You.com" className="w-9 h-9 object-contain" />
              </div>
              <div className="absolute w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg" style={{ transform: 'translate(-250px, 0px) translate(-50%, -50%)' }}>
                <img src="https://www.anthropic.com/favicon.ico" alt="Anthropic" className="w-9 h-9 object-contain" />
              </div>
            </div>

            {/* Ring 4 - 4 logos (radius 300px) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="absolute w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg" style={{ transform: 'translate(212px, -212px) translate(-50%, -50%)' }}>
                <img src="https://huggingface.co/favicon.ico" alt="HuggingFace" className="w-9 h-9 object-contain" />
              </div>
              <div className="absolute w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg" style={{ transform: 'translate(212px, 212px) translate(-50%, -50%)' }}>
                <img src="https://poe.com/favicon.ico" alt="Poe" className="w-9 h-9 object-contain" />
              </div>
              <div className="absolute w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg" style={{ transform: 'translate(-212px, 212px) translate(-50%, -50%)' }}>
                <img src="https://character.ai/favicon.ico" alt="Character.AI" className="w-9 h-9 object-contain" />
              </div>
              <div className="absolute w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg" style={{ transform: 'translate(-212px, -212px) translate(-50%, -50%)' }}>
                <img src="https://mistral.ai/favicon.ico" alt="Mistral" className="w-9 h-9 object-contain" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
