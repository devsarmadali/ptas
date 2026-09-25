import type { ReactNode } from "react";
import { tokens } from "./tokens.js";
import { StatusBadge } from "./status-badge.js";

export interface PageShellProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly systemName?: string;
  readonly roleContext?: string;
  readonly jurisdictionContext?: string;
  readonly headerActions?: ReactNode;
  readonly children: ReactNode;
}

export function PageShell({
  title,
  subtitle,
  systemName = "Punjab Professional Tax Administration System",
  roleContext,
  jurisdictionContext,
  headerActions,
  children
}: PageShellProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: tokens.color.surface.subtle,
        color: tokens.color.text.default,
        fontFamily: tokens.font.family.sans
      }}
    >
      {/* Accessible Skip Link for Keyboard Users (WCAG 2.2 AA) */}
      <a
        href="#main-content"
        className="skip-link"
        style={{
          position: "absolute",
          top: tokens.spacing[2],
          left: tokens.spacing[2],
          zIndex: 9999,
          padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
          backgroundColor: tokens.color.action.default,
          color: tokens.color.surface.default,
          fontWeight: tokens.font.weight.bold,
          borderRadius: tokens.radius.small,
          textDecoration: "none",
          transform: "translateY(-200%)",
          transition: "transform 150ms ease"
        }}
      >
        Skip to main content
      </a>

      {/* Draft Disclaimer Banner (Mandatory per AGENTS.md / Design Tokens) */}
      <div
        role="region"
        aria-label="Development preview notice"
        style={{
          backgroundColor: tokens.color.warning.subtle,
          borderBottom: `1px solid ${tokens.color.border.default}`,
          padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
          fontSize: tokens.font.size.small,
          color: tokens.color.warning.text,
          textAlign: "center",
          fontWeight: tokens.font.weight.medium
        }}
      >
        Draft Non-Branded Engineering Prototype. Official Punjab Government branding is
        approval-gated.
      </div>

      {/* Main Global Header */}
      <header
        style={{
          backgroundColor: tokens.color.surface.default,
          borderBottom: `1px solid ${tokens.color.border.default}`,
          padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: tokens.spacing[3]
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: tokens.font.size.small,
              color: tokens.color.text.muted,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: tokens.font.weight.bold
            }}
          >
            {systemName}
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: tokens.font.size.title,
              fontWeight: tokens.font.weight.bold,
              color: tokens.color.text.default
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              style={{
                margin: 0,
                marginTop: tokens.spacing[1],
                fontSize: tokens.font.size.body,
                color: tokens.color.text.muted
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: tokens.spacing[3],
            flexWrap: "wrap"
          }}
        >
          {roleContext ? <StatusBadge tone="neutral">Role: {roleContext}</StatusBadge> : null}
          {jurisdictionContext ? (
            <StatusBadge tone="neutral">Jurisdiction: {jurisdictionContext}</StatusBadge>
          ) : null}
          {headerActions}
        </div>
      </header>

      {/* Accessible Main Landmark with tabIndex={-1} for focus management */}
      <main
        id="main-content"
        tabIndex={-1}
        style={{
          flex: 1,
          padding: tokens.spacing[6],
          maxWidth: "1720px",
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
          outline: "none"
        }}
      >
        {children}
      </main>
    </div>
  );
}
