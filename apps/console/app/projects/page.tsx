"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Redirect old /projects route to /dashboard
export default function ProjectsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
