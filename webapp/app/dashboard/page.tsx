"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/projects");
  }, [router]);

  return (
    <div className="bg-gray-50 min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-neutral-500 text-sm">Redirecting...</p>
      </div>
    </div>
  );
}
