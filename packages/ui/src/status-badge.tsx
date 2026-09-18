import type { ReactNode } from "react";
import { tokens } from "./tokens.js";

export type StatusBadgeTone = "neutral" | "success" | "warning" | "danger";

export interface StatusBadgeProps {
  readonly children: ReactNode;
  readonly tone?: StatusBadgeTone;
}

const toneStyles: Record<StatusBadgeTone, { background: string; color: string; border: string }> = {
  neutral: {
    background: tokens.color.neutral.subtle,
    color: tokens.color.neutral.text,
    border: `1px solid ${tokens.color.border.default}`
  },
  success: {
    background: tokens.color.success.subtle,
    color: tokens.color.success.text,
    border: "1px solid #a6f4c5"
  },
  warning: {
    background: tokens.color.warning.subtle,
    color: tokens.color.warning.text,
    border: "1px solid #fedf89"
  },
  danger: {
    background: tokens.color.danger.subtle,
    color: tokens.color.danger.text,
    border: "1px solid #fecdca"
  }
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  const current = toneStyles[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "2rem",
        borderRadius: tokens.radius.pill,
        paddingLeft: tokens.spacing[3],
        paddingRight: tokens.spacing[3],
        paddingTop: tokens.spacing[1],
        paddingBottom: tokens.spacing[1],
        fontFamily: tokens.font.family.sans,
        fontSize: tokens.font.size.small,
        fontWeight: tokens.font.weight.bold,
        backgroundColor: current.background,
        color: current.color,
        border: current.border,
        whiteSpace: "nowrap"
      }}
    >
      {children}
    </span>
  );
}
