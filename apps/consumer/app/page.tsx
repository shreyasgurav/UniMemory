"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Loader2 } from "lucide-react";
import Image from "next/image";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/memories");
      } else {
        router.push("/login");
      }
    });
    return () => unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Image 
          src="/Unimemory Name Logo NoBG.png" 
          alt="UniMemory" 
          width={200} 
          height={60} 
          className="mx-auto mb-6"
          priority
        />
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400 mx-auto" />
      </div>
    </div>
  );
}
