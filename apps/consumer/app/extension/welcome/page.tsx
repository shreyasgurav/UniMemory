"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ExtensionWelcomePage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>("Connecting your extension...");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          // Send the user to login and come back here
          const redirect = encodeURIComponent("/extension/welcome");
          router.push(`/login?extension=true&redirect=${redirect}`);
          return;
        }
        const token = await user.getIdToken(true);
        // Post a message that the extension content script listens for
        window.postMessage({ type: "UNIMEMORY_ID_TOKEN", token }, window.location.origin);
        setStatus("Extension connected. You can close this tab.");
        // Optionally close the tab after a short delay
        setTimeout(() => {
          window.close();
        }, 1200);
      } catch (e) {
        setStatus("Failed to connect extension. Please try again.");
      }
    });
    return () => unsub();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="bg-white border border-neutral-100 rounded-2xl p-8 text-center max-w-sm w-full">
        <div className="w-12 h-12 rounded-xl bg-neutral-900 text-white mx-auto mb-3 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-neutral-900 mb-1">UniMemory Extension</h1>
        <p className="text-sm text-neutral-600">{status}</p>
      </div>
    </div>
  );
}
