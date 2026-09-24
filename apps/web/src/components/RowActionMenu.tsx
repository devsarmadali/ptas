"use client";

import React, { useEffect, useRef, useState } from "react";

export interface RowAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly onClick: () => void;
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
 * Replaces cluttered inline row buttons with a single Actions dropdown.
 * - Single-action exception: renders direct button if exactly 1 action exists.
 * - Does not alter table row height or cause page layout shifting.
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

  // Close on outside click
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

  const activeActions = actions.filter((a) => !a.disabled);

  if (activeActions.length === 0) {
    return null;
  }

  // Single-action exception: render directly if only 1 action
  if (activeActions.length === 1) {
    const action = activeActions[0]!;
    return (
      <button
        type="button"
        className={`btn-sm ${
          action.variant === "primary"
            ? "btn-primary"
            : action.variant === "danger"
              ? "btn-secondary text-danger"
              : "btn-secondary"
        }`}
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
            zIndex: 1000,
            minWidth: "13.5rem",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            padding: "0.35rem 0",
            overflow: "hidden"
          }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          {activeActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="row-action-menu-item"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                width: "100%",
                padding: "0.5rem 0.85rem",
                fontSize: "0.8rem",
                color:
                  action.variant === "danger"
                    ? "#b91c1c"
                    : action.variant === "primary"
                      ? "#0d3822"
                      : action.variant === "success"
                        ? "#15803d"
                        : "#1e293b",
                background: "none",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                fontWeight: action.variant === "primary" ? 600 : 500,
                transition: "background-color 0.12s ease"
              }}
              onClick={() => {
                setIsOpen(false);
                action.onClick();
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
          ))}
        </div>
      )}
    </div>
  );
}
