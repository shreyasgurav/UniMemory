"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Sidebar from "@/components/shared/Sidebar";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.id as string;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/");
        return;
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!projectId) {
      router.push("/projects");
      return;
    }
  }, [projectId, router]);

  if (!projectId) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar projectId={projectId} />
      <main className="flex-1 ml-56 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
