"use client";

import React, { useEffect, useId, useRef } from "react";
import { CloseIcon } from "./Icons";

export type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: React.ReactNode;
  readonly children: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly size?: ModalSize;
  readonly closeOnBackdrop?: boolean;
  readonly closeLabel?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])'
].join(", ");

/**
 * Unified WCAG 2.2 AA accessible Modal dialog.
 * - Traps Tab/Shift+Tab focus inside dialog
 * - Closes on Escape key
 * - Restores focus to the triggering element on close
 * - Locks background page scroll while open
 * - Adapts seamlessly across desktop and mobile viewports with sticky header/footer
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
  closeLabel = "Close dialog"
}: ModalProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusInitial = window.setTimeout(() => {
      const card = cardRef.current;
      if (!card) return;
      const focusable = card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length > 0) {
        focusable[0]?.focus();
      } else {
        card.focus();
      }
    }, 10);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !cardRef.current) return;
      const focusable = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      if (focusable.length === 0) {
        event.preventDefault();
        cardRef.current.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey) {
        if (document.activeElement === first || document.activeElement === cardRef.current) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusInitial);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClass =
    size === "sm"
      ? "modal-card modal-card-sm"
      : size === "lg"
        ? "modal-card modal-card-lg"
        : size === "xl"
          ? "modal-card modal-card-xl"
          : "modal-card";

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div ref={cardRef} className={sizeClass} tabIndex={-1}>
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer !== undefined && footer !== null && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
