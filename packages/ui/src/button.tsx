import type { ButtonHTMLAttributes, ReactNode } from "react";
import { tokens } from "./tokens.js";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly ariaLabel?: string;
}

const variantStyles: Record<
  ButtonVariant,
  { background: string; color: string; border: string; hoverBg: string }
> = {
  primary: {
    background: tokens.color.action.default,
    color: tokens.color.surface.default,
    border: `1px solid ${tokens.color.action.default}`,
    hoverBg: tokens.color.action.hover
  },
  secondary: {
    background: tokens.color.surface.default,
    color: tokens.color.text.default,
    border: `1px solid ${tokens.color.border.default}`,
    hoverBg: tokens.color.surface.subtle
  },
  danger: {
    background: tokens.color.danger.default,
    color: tokens.color.surface.default,
    border: `1px solid ${tokens.color.danger.default}`,
    hoverBg: "#912018"
  }
};

export function Button({
  children,
  variant = "primary",
  disabled = false,
  type = "button",
  ariaLabel,
  style,
  ...rest
}: ButtonProps) {
  const currentVariant = variantStyles[variant];

  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: tokens.spacing[11], // 44px minimum touch/target height for WCAG 2.2 AA
        paddingLeft: tokens.spacing[4],
        paddingRight: tokens.spacing[4],
        paddingTop: tokens.spacing[2],
        paddingBottom: tokens.spacing[2],
        fontFamily: tokens.font.family.sans,
        fontSize: tokens.font.size.body,
        fontWeight: tokens.font.weight.semibold,
        borderRadius: tokens.radius.small,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        backgroundColor: currentVariant.background,
        color: currentVariant.color,
        border: currentVariant.border,
        outline: "none",
        transition: "background-color 150ms ease, box-shadow 150ms ease",
        ...style
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
