"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Brain, Loader2 } from "lucide-react";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/(authenticated)");
      } else {
        router.push("/login");
      }
    });
    return () => unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Brain className="w-8 h-8 text-white" />
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400 mx-auto" />
      </div>
    </div>
  );
}
