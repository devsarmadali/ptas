"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "./ui/Icons";

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
 * - Single-action exception: renders direct button/link if exactly 1 action exists.
 * - Full WAI-ARIA keyboard menu navigation (ArrowDown, ArrowUp, Home, End, Escape).
 * - Focuses trigger button on Escape close and cleans up stacking context on unmount.
 */
export function RowActionMenu({
  actions,
  label = "Actions",
  align = "right",
  buttonClassName = "unit-actions-btn action-menu-trigger",
  ariaLabel
}: RowActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getEnabledMenuItems = () => {
    if (!dropdownRef.current) return [];
    return Array.from(
      dropdownRef.current.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])'
      )
    );
  };

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
        e.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
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

  // Elevate parent td and tr stacking contexts while dropdown is open so it stays above sticky cells
  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    const parentTd = container?.closest("td");
    const parentTr = container?.closest("tr");

    if (parentTd) {
      parentTd.classList.add("action-menu-active-cell");
      parentTd.style.zIndex = "120";
    }
    if (parentTr) {
      parentTr.classList.add("action-menu-active-row");
      parentTr.style.zIndex = "120";
      parentTr.style.position = "relative";
    }

    return () => {
      if (parentTd) {
        parentTd.classList.remove("action-menu-active-cell");
        parentTd.style.zIndex = "";
      }
      if (parentTr) {
        parentTr.classList.remove("action-menu-active-row");
        parentTr.style.zIndex = "";
        parentTr.style.position = "";
      }
    };
  }, [isOpen]);

  // Auto-scroll to bring the opened dropdown panel cleanly into view
  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      if (!dropdownRef.current) return;

      dropdownRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest"
      });

      const rect = dropdownRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const margin = 28;

      if (rect.bottom > viewportHeight - margin) {
        window.scrollBy({ top: rect.bottom - viewportHeight + margin, behavior: "smooth" });
      } else if (rect.top < margin + 60) {
        window.scrollBy({ top: rect.top - margin - 60, behavior: "smooth" });
      }
    }, 40);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = getEnabledMenuItems();
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = items[(currentIndex + 1) % items.length];
      next?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = items[(currentIndex - 1 + items.length) % items.length];
      prev?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  if (actions.length === 0) {
    return null;
  }

  // Single-action exception: render directly if only 1 action
  if (actions.length === 1) {
    const action = actions[0]!;
    const singleVariantClass =
      action.variant === "primary"
        ? "btn-primary"
        : action.variant === "danger"
          ? "btn-outline-danger"
          : "btn-secondary";

    if (action.href) {
      return (
        <a
          href={action.disabled ? undefined : action.href}
          target={action.target ?? "_blank"}
          rel="noopener noreferrer"
          aria-disabled={action.disabled || undefined}
          className={`btn-sm ${singleVariantClass}`}
          style={action.disabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}
          title={action.title ?? action.label}
          aria-label={action.label}
          onClick={action.onClick}
        >
          {action.icon && <span className="row-action-menu-icon">{action.icon}</span>}
          <span>{action.label}</span>
        </a>
      );
    }

    return (
      <button
        type="button"
        disabled={action.disabled}
        className={`btn-sm ${singleVariantClass}`}
        onClick={action.onClick}
        title={action.title ?? action.label}
        aria-label={action.label}
      >
        {action.icon && <span className="row-action-menu-icon">{action.icon}</span>}
        <span>{action.label}</span>
      </button>
    );
  }

  const alignClass =
    align === "right" ? "row-action-menu-dropdown--right" : "row-action-menu-dropdown--left";

  return (
    <div ref={containerRef} className={`row-action-menu-container ${isOpen ? "is-open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={buttonClassName}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !isOpen) {
            e.preventDefault();
            setIsOpen(true);
            window.setTimeout(() => {
              getEnabledMenuItems()[0]?.focus();
            }, 0);
          }
        }}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        aria-label={ariaLabel ?? label}
        title={ariaLabel ?? label}
      >
        <span>{label}</span>
        {isOpen ? <ChevronUpIcon size={13} /> : <ChevronDownIcon size={13} />}
      </button>

      {isOpen && (
        <div
          id={menuId}
          ref={dropdownRef}
          className={`row-action-menu-dropdown ${alignClass}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleMenuKeyDown}
          role="menu"
          aria-label={ariaLabel ?? label}
        >
          {actions.map((action) => {
            const variantClass =
              action.variant === "danger"
                ? "danger"
                : action.variant === "primary"
                  ? "primary"
                  : action.variant === "success"
                    ? "success"
                    : "";
            const disabledClass = action.disabled ? "is-disabled" : "";

            if (action.href) {
              return (
                <a
                  key={action.id}
                  href={action.disabled ? undefined : action.href}
                  target={action.target ?? "_blank"}
                  rel="noopener noreferrer"
                  aria-disabled={action.disabled || undefined}
                  className={`row-action-menu-item ${variantClass} ${disabledClass}`.trim()}
                  onClick={(e) => {
                    if (action.disabled) {
                      e.preventDefault();
                      return;
                    }
                    window.setTimeout(() => setIsOpen(false), 80);
                    action.onClick?.();
                  }}
                  title={action.title}
                  role="menuitem"
                >
                  {action.icon && <span className="row-action-menu-icon">{action.icon}</span>}
                  <span className="row-action-menu-label">{action.label}</span>
                </a>
              );
            }

            return (
              <button
                key={action.id}
                type="button"
                disabled={action.disabled}
                className={`row-action-menu-item ${variantClass} ${disabledClass}`.trim()}
                onClick={() => {
                  if (action.disabled) return;
                  setIsOpen(false);
                  action.onClick?.();
                }}
                title={action.title}
                role="menuitem"
              >
                {action.icon && <span className="row-action-menu-icon">{action.icon}</span>}
                <span className="row-action-menu-label">{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
