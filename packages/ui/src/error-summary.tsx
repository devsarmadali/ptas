import { tokens } from "./tokens.js";

export interface ErrorItem {
  readonly fieldId?: string;
  readonly message: string;
}

export interface ErrorSummaryProps {
  readonly title?: string;
  readonly errors: readonly ErrorItem[];
}

export function ErrorSummary({ title = "There is a problem", errors }: ErrorSummaryProps) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div
      role="alert"
      tabIndex={-1}
      aria-labelledby="error-summary-title"
      style={{
        padding: tokens.spacing[4],
        border: `2px solid ${tokens.color.danger.default}`,
        borderRadius: tokens.radius.small,
        backgroundColor: tokens.color.danger.subtle,
        fontFamily: tokens.font.family.sans,
        marginBottom: tokens.spacing[6]
      }}
    >
      <h2
        id="error-summary-title"
        style={{
          margin: 0,
          marginBottom: tokens.spacing[2],
          fontSize: tokens.font.size.large,
          fontWeight: tokens.font.weight.bold,
          color: tokens.color.danger.text
        }}
      >
        {title}
      </h2>

      <ul
        style={{
          margin: 0,
          paddingLeft: tokens.spacing[5],
          display: "flex",
          flexDirection: "column",
          gap: tokens.spacing[1]
        }}
      >
        {errors.map((error, index) => (
          <li key={index} style={{ color: tokens.color.danger.text }}>
            {error.fieldId ? (
              <a
                href={`#${error.fieldId}`}
                style={{
                  color: tokens.color.danger.text,
                  fontWeight: tokens.font.weight.semibold,
                  textDecoration: "underline"
                }}
              >
                {error.message}
              </a>
            ) : (
              <span>{error.message}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
