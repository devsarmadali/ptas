/**
 * PTAS Draft Non-Branded Design Tokens
 * Derived from docs/ui/design-tokens.json
 * Official Punjab/Excise branding remains approval-gated.
 */

export const tokens = {
  color: {
    surface: {
      default: "#ffffff",
      subtle: "#f5f7f9"
    },
    text: {
      default: "#17202a",
      muted: "#4b5563"
    },
    action: {
      default: "#0b5cab",
      hover: "#084b8a"
    },
    danger: {
      default: "#b42318",
      subtle: "#fee4e2",
      text: "#912018"
    },
    success: {
      default: "#067647",
      subtle: "#d1fadf",
      text: "#055f3b"
    },
    warning: {
      default: "#b54708",
      subtle: "#fff1c2",
      text: "#713b00"
    },
    neutral: {
      default: "#64748b",
      subtle: "#e2e8f0",
      text: "#17202a"
    },
    border: {
      default: "#cbd5e1",
      focus: "#0b5cab",
      danger: "#b42318"
    }
  },
  spacing: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    7: "28px",
    8: "32px",
    9: "36px",
    10: "40px",
    11: "44px",
    12: "48px"
  },
  radius: {
    small: "4px",
    medium: "8px",
    pill: "9999px"
  },
  font: {
    family: {
      sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    },
    size: {
      small: "0.875rem",
      body: "1rem",
      large: "1.125rem",
      title: "1.75rem"
    },
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700
    }
  }
} as const;

export type DesignTokens = typeof tokens;
