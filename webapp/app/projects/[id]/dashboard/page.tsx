"use client";

import { useParams } from "next/navigation";
import DashboardView from "@/components/dashboard/DashboardView";

export default function DashboardPage() {
  const params = useParams();
  const projectId = params?.id as string;

  if (!projectId) return null;

  return <DashboardView projectId={projectId} />;
}
