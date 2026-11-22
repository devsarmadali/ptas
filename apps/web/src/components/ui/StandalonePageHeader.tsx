"use client";

import React from "react";
import { ArrowLeftIcon } from "./Icons";

export interface StandaloneNavAction {
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
}

export interface StandalonePageHeaderProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly subtitle?: React.ReactNode;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly topLinks?: readonly StandaloneNavAction[];
  readonly bannerActions?: React.ReactNode;
}

/**
 * Unified institutional header for standalone PTAS routes.
 * Provides accessible skip-to-content link, restrained navigation bar (hidden in print),
 * and consistent Punjab Excise & Taxation Department banner with semantic <h1>.
 */
export function StandalonePageHeader({
  eyebrow = "Government of the Punjab • Excise, Taxation & Narcotics Control Department",
  title,
  subtitle,
  backHref = "/demand/pft3",
  backLabel = "Return to Main Dashboard",
  topLinks = [],
  bannerActions
}: StandalonePageHeaderProps) {
  return (
    <>
      <a href="#main-content" className="skip-link no-print">
        Skip to main content
      </a>

      <header className="no-print">
        <nav className="standalone-topbar" aria-label="Standalone page navigation">
          <a
            href={backHref}
            className="btn-secondary btn-sm"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            <ArrowLeftIcon size={14} />
            <span>{backLabel}</span>
          </a>

          {topLinks.length > 0 && (
            <div className="standalone-topbar-links">
              {topLinks.map((link) => (
                <a
                  key={`${link.href}:${link.label}`}
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener noreferrer" : undefined}
                  className="btn-secondary btn-sm"
                  style={{ textDecoration: "none" }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </nav>

        <div className="standalone-banner">
          <div>
            <div className="standalone-banner-eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            {subtitle && <div className="standalone-banner-subtitle">{subtitle}</div>}
          </div>

          {bannerActions && <div className="standalone-banner-actions">{bannerActions}</div>}
        </div>
      </header>
    </>
  );
}
