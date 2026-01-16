"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default function ExtensionWelcomePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          const redirect = encodeURIComponent("/extension/welcome");
          router.push(`/login?extension=true&redirect=${redirect}`);
          return;
        }
        const token = await user.getIdToken(true);
        window.postMessage({ type: "UNIMEMORY_ID_TOKEN", token }, window.location.origin);
        setStatus("connected");
        setTimeout(() => {
          window.close();
        }, 1500);
      } catch (e) {
        setStatus("error");
      }
    });
    return () => unsub();
  }, [router]);

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
      
      {status === "connecting" && (
        <p className="text-2xl text-neutral-700">Connecting to UniMemory Extension...</p>
      )}
      
      {status === "connected" && (
        <p className="text-2xl text-green-600 font-medium">Connected ✓</p>
      )}
      
      {status === "error" && (
        <p className="text-2xl text-red-600">Connection failed. Please try again.</p>
      )}
    </div>
  );
}
