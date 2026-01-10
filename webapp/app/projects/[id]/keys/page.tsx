"use client";

import { useParams } from "next/navigation";
import KeysView from "@/components/keys/KeysView";

export default function KeysPage() {
  const params = useParams();
  const projectId = params?.id as string;

  if (!projectId) return null;

  return <KeysView projectId={projectId} />;
}
