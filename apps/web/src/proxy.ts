import { NextRequest, NextResponse } from "next/server";

export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function buildNonceCspHeader(
  nonce: string,
  options?: {
    readonly isProduction?: boolean | undefined;
    readonly isHttpsDeployment?: boolean | undefined;
  }
): string {
  const isProduction = options?.isProduction ?? process.env.NODE_ENV === "production";
  const isHttpsDeployment =
    options?.isHttpsDeployment ??
    Boolean(process.env.VERCEL === "1" || process.env.PTAS_ENFORCE_HTTPS_CSP === "true");

  return [
    "default-src 'self'",
    isProduction
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isHttpsDeployment ? ["upgrade-insecure-requests"] : [])
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = generateCspNonce();
  const contentSecurityPolicyHeaderValue = buildNonceCspHeader(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|punjab-logo.png|government-of-punjab-seeklogo.png).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
