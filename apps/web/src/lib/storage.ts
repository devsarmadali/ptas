/**
 * Supabase Storage Integration for Challan 32-A Scans and Document Evidence
 * Computes 64-character SHA-256 cryptographic digests in-browser and uploads to private buckets.
 */

import { getSupabaseAuthClient } from "./supabase-auth";

export const MAX_RECEIPT_UPLOAD_BYTES = 5 * 1024 * 1024;
const RECEIPT_UPLOAD_BUCKET = "receipts-challan32a";
const SAFE_UNIT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const ALLOWED_RECEIPT_MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"]
};

export interface UploadReceiptResult {
  readonly url: string;
  readonly sha256: string;
  readonly fileName: string;
  readonly fileSize: number;
}

/**
 * Computes genuine 64-character SHA-256 digest of a File in the browser using Web Crypto API.
 */
export async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digestBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(digestBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toLowerCase();
}

function validateReceiptUploadInput(
  file: File,
  unitId: string
): { readonly ext: string; readonly mimeType: string } {
  if (!SAFE_UNIT_ID_PATTERN.test(unitId)) {
    throw new Error("Invalid unit identifier for receipt evidence upload.");
  }

  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_RECEIPT_UPLOAD_BYTES) {
    throw new Error("Receipt evidence file must be non-empty and at most 5 MB.");
  }

  const mimeType = (file.type || "").trim().toLowerCase();
  const allowedExts = ALLOWED_RECEIPT_MIME_EXTENSIONS[mimeType];
  if (!allowedExts) {
    throw new Error(
      "Unsupported receipt evidence file type. Only JPEG, PNG, WEBP, or PDF are allowed."
    );
  }

  const rawExt = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  if (!allowedExts.includes(rawExt)) {
    throw new Error("Receipt evidence file extension does not match its declared MIME type.");
  }

  return { ext: rawExt, mimeType };
}

/**
 * Uploads a Challan 32-A payment slip scan to private Supabase Storage bucket 'receipts-challan32a'.
 * Fails closed when session or cloud storage is unavailable; returns a short-lived signed URL when available.
 */
export async function uploadReceiptScan(
  file: File,
  unitId: string,
  receiptNumber: string
): Promise<UploadReceiptResult> {
  const { ext, mimeType } = validateReceiptUploadInput(file, unitId);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Secure receipt storage is not configured");
  }

  const supabase = getSupabaseAuthClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    throw new Error("Authentication required before uploading receipt evidence.");
  }

  const sha256 = await computeFileSha256(file);
  const sanitizedReceipt = receiptNumber.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "receipt";
  const randomSuffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);
  const storagePath = `receipts/${unitId}/${sanitizedReceipt}-${Date.now()}-${randomSuffix}.${ext}`;

  const { error } = await supabase.storage.from(RECEIPT_UPLOAD_BUCKET).upload(storagePath, file, {
    cacheControl: "3600",
    contentType: mimeType,
    upsert: false
  });

  if (error) {
    throw new Error(`Receipt evidence upload failed: ${error.message}`);
  }

  const { data: signedData } = await supabase.storage
    .from(RECEIPT_UPLOAD_BUCKET)
    .createSignedUrl(storagePath, 3600);

  return {
    url: signedData?.signedUrl || storagePath,
    sha256,
    fileName: file.name,
    fileSize: file.size
  };
}
