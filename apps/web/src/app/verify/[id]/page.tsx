"use client";

import React, { Suspense, use } from "react";
import { PublicVerificationContent } from "../page";

interface VerifyIdPageProps {
  params: Promise<{ id: string }>;
}

function safeDecodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function VerifyIdInner({ params }: VerifyIdPageProps) {
  const resolvedParams = use(params);
  const id = resolvedParams.id ? safeDecodeParam(resolvedParams.id) : "";

  return <PublicVerificationContent defaultQuery={id} />;
}

export default function VerifyIdPage({ params }: VerifyIdPageProps) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "3rem", textAlign: "center" }}>Loading verification portal...</div>
      }
    >
      <VerifyIdInner params={params} />
    </Suspense>
  );
}
