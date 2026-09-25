import type { Route } from "next";
import { redirect } from "next/navigation";

export default async function ReportSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/intelligence/reports/view?report=${encodeURIComponent(slug)}` as unknown as Route);
}
