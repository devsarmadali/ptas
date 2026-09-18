import type { ReactNode } from "react";

export type StatusBadgeProps = Readonly<{
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}>;

const toneStyles = {
  neutral: { background: "#e2e8f0", color: "#17202a" },
  success: { background: "#d1fadf", color: "#055f3b" },
  warning: { background: "#fff1c2", color: "#713b00" },
  danger: { background: "#fee4e2", color: "#912018" }
} as const;

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      style={{
        ...toneStyles[tone],
        display: "inline-flex",
        alignItems: "center",
        minHeight: "2rem",
        borderRadius: "999px",
        padding: "0.25rem 0.75rem",
        fontWeight: 700
      }}
    >
      {children}
    </span>
  );
}
