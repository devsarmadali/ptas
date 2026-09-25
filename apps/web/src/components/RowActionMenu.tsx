"use client";

import React, { useEffect, useRef, useState } from "react";

export interface RowAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly onClick?: () => void;
  readonly href?: string;
  readonly target?: string;
  readonly variant?: "default" | "primary" | "danger" | "success";
  readonly disabled?: boolean;
  readonly title?: string;
}

export interface RowActionMenuProps {
  readonly actions: readonly RowAction[];
  readonly label?: string;
  readonly align?: "left" | "right";
  readonly buttonClassName?: string;
  readonly ariaLabel?: string;
}

/**
 * Universal Floating Popover Row Action Menu.
 * Replaces cluttered inline row buttons with an overlay action dropdown.
 * - Renders as an overlay popover with zIndex 10000 without nesting or inner scrollbars.
 * - Single-action exception: renders direct button if exactly 1 action exists.
 * - Closes on click, outside click, and Escape key.
 */
export function RowActionMenu({
  actions,
  label = "Actions",
  align = "right",
  buttonClassName = "unit-actions-btn action-menu-trigger",
  ariaLabel
}: RowActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click and Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (actions.length === 0) {
    return null;
  }

  // Single-action exception: render directly if only 1 action
  if (actions.length === 1) {
    const action = actions[0]!;
    if (action.href) {
      return (
        <a
          href={action.href}
          target={action.target ?? "_blank"}
          rel="noopener noreferrer"
          className={`btn-sm ${
            action.variant === "primary"
              ? "btn-primary"
              : action.variant === "danger"
                ? "btn-secondary text-danger"
                : "btn-secondary"
          }`}
          style={{
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            ...(action.disabled ? { opacity: 0.5, pointerEvents: "none" } : {})
          }}
          title={action.title ?? action.label}
          aria-label={action.label}
          onClick={action.onClick}
        >
          {action.icon && <span style={{ marginRight: "0.3rem" }}>{action.icon}</span>}
          <span>{action.label}</span>
        </a>
      );
    }
    return (
      <button
        type="button"
        disabled={action.disabled}
        className={`btn-sm ${
          action.variant === "primary"
            ? "btn-primary"
            : action.variant === "danger"
              ? "btn-secondary text-danger"
              : "btn-secondary"
        }`}
        style={action.disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        onClick={action.onClick}
        title={action.title ?? action.label}
        aria-label={action.label}
      >
        {action.icon && <span style={{ marginRight: "0.3rem" }}>{action.icon}</span>}
        <span>{action.label}</span>
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className="row-action-menu-container"
      style={{
        position: "relative",
        display: "inline-block",
        textAlign: "left"
      }}
    >
      <button
        type="button"
        className={buttonClassName}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={ariaLabel ?? label}
        title={ariaLabel ?? label}
      >
        <span>{label}</span>
        <span style={{ fontSize: "0.7rem", marginLeft: "0.25rem" }}>{isOpen ? "▴" : "▾"}</span>
      </button>

      {isOpen && (
        <div
          className="row-action-menu-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            [align === "right" ? "right" : "left"]: 0,
            zIndex: 10000,
            minWidth: "14.5rem",
            maxWidth: "20rem",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.15)",
            padding: "0.35rem 0",
            overflow: "hidden"
          }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          {actions.map((action) =>
            action.href ? (
              <a
                key={action.id}
                href={action.href}
                target={action.target ?? "_blank"}
                rel="noopener noreferrer"
                className={`row-action-menu-item ${action.variant === "danger" ? "danger" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  width: "100%",
                  padding: "0.5rem 0.85rem",
                  fontSize: "0.8rem",
                  color: action.disabled
                    ? "#94a3b8"
                    : action.variant === "danger"
                      ? "#b91c1c"
                      : action.variant === "primary"
                        ? "#0d3822"
                        : action.variant === "success"
                          ? "#15803d"
                          : "#1e293b",
                  background: "none",
                  border: "none",
                  textAlign: "left",
                  textDecoration: "none",
                  cursor: action.disabled ? "not-allowed" : "pointer",
                  opacity: action.disabled ? 0.6 : 1,
                  fontWeight: action.variant === "primary" ? 600 : 500,
                  transition: "background-color 0.12s ease"
                }}
                onClick={(e) => {
                  if (action.disabled) {
                    e.preventDefault();
                    return;
                  }
                  setTimeout(() => setIsOpen(false), 80);
                  action.onClick?.();
                }}
                title={action.title}
                role="menuitem"
              >
                {action.icon && (
                  <span
                    style={{
                      fontSize: "0.95rem",
                      width: "1.25rem",
                      textAlign: "center",
                      flexShrink: 0
                    }}
                  >
                    {action.icon}
                  </span>
                )}
                <span style={{ flex: 1, whiteSpace: "nowrap" }}>{action.label}</span>
              </a>
            ) : (
              <button
                key={action.id}
                type="button"
                disabled={action.disabled}
                className={`row-action-menu-item ${action.variant === "danger" ? "danger" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  width: "100%",
                  padding: "0.5rem 0.85rem",
                  fontSize: "0.8rem",
                  color: action.disabled
                    ? "#94a3b8"
                    : action.variant === "danger"
                      ? "#b91c1c"
                      : action.variant === "primary"
                        ? "#0d3822"
                        : action.variant === "success"
                          ? "#15803d"
                          : "#1e293b",
                  background: "none",
                  border: "none",
                  textAlign: "left",
                  cursor: action.disabled ? "not-allowed" : "pointer",
                  opacity: action.disabled ? 0.6 : 1,
                  fontWeight: action.variant === "primary" ? 600 : 500,
                  transition: "background-color 0.12s ease"
                }}
                onClick={() => {
                  if (action.disabled) return;
                  setIsOpen(false);
                  action.onClick?.();
                }}
                title={action.title}
                role="menuitem"
              >
                {action.icon && (
                  <span
                    style={{
                      fontSize: "0.95rem",
                      width: "1.25rem",
                      textAlign: "center",
                      flexShrink: 0
                    }}
                  >
                    {action.icon}
                  </span>
                )}
                <span style={{ flex: 1, whiteSpace: "nowrap" }}>{action.label}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
