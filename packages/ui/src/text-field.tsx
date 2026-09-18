import type { InputHTMLAttributes } from "react";
import { tokens } from "./tokens.js";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly errorMessage?: string;
  readonly required?: boolean;
}

export function TextField({
  id,
  label,
  hint,
  errorMessage,
  required = false,
  disabled = false,
  type = "text",
  style,
  ...rest
}: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errorMessage ? `${id}-error` : undefined;

  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacing[1],
        fontFamily: tokens.font.family.sans
      }}
    >
      <label
        htmlFor={id}
        style={{
          fontSize: tokens.font.size.body,
          fontWeight: tokens.font.weight.semibold,
          color: tokens.color.text.default
        }}
      >
        {label}
        {required ? (
          <span
            aria-hidden="true"
            style={{ color: tokens.color.danger.default, marginLeft: "4px" }}
          >
            *
          </span>
        ) : null}
      </label>

      {hint ? (
        <span
          id={hintId}
          style={{
            fontSize: tokens.font.size.small,
            color: tokens.color.text.muted
          }}
        >
          {hint}
        </span>
      ) : null}

      {errorMessage ? (
        <span
          id={errorId}
          role="alert"
          style={{
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.medium,
            color: tokens.color.danger.default
          }}
        >
          {errorMessage}
        </span>
      ) : null}

      <input
        id={id}
        type={type}
        required={required}
        disabled={disabled}
        aria-required={required}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={describedBy}
        style={{
          minHeight: tokens.spacing[11], // 44px
          paddingLeft: tokens.spacing[3],
          paddingRight: tokens.spacing[3],
          fontSize: tokens.font.size.body,
          color: tokens.color.text.default,
          backgroundColor: disabled ? tokens.color.surface.subtle : tokens.color.surface.default,
          border: `1px solid ${errorMessage ? tokens.color.border.danger : tokens.color.border.default}`,
          borderRadius: tokens.radius.small,
          outline: "none",
          cursor: disabled ? "not-allowed" : "text",
          boxSizing: "border-box",
          ...style
        }}
        {...rest}
      />
    </div>
  );
}
