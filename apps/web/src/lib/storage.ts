/**
 * Supabase Storage Integration for Challan 32-A Scans and Document Evidence
 * Computes 64-character SHA-256 cryptographic digests in-browser and uploads to private buckets.
 */

import { createPtasSupabaseClient } from "@ptas/database/client";

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

/**
 * Uploads a Challan 32-A payment slip scan to Supabase Storage bucket 'receipts-challan32a'.
 * Fails closed when cloud storage is unavailable; a local preview is not evidence of receipt.
 */
export async function uploadReceiptScan(
  file: File,
  unitId: string,
  receiptNumber: string
): Promise<UploadReceiptResult> {
  const sha256 = await computeFileSha256(file);
  const ext = file.name.split(".").pop() || "png";
  const sanitizedReceipt = receiptNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const storagePath = `receipts/${unitId}/${sanitizedReceipt}-${Date.now()}.${ext}`;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase receipt storage is not configured");
  }

  try {
    const supabase = createPtasSupabaseClient({
      url: supabaseUrl,
      key: supabaseKey
    });

    const { error } = await supabase.storage.from("receipts-challan32a").upload(storagePath, file, {
      cacheControl: "3600",
      upsert: true
    });

    if (error) {
      throw new Error(`Receipt evidence upload failed: ${error.message}`);
    }

    const { data: publicData } = supabase.storage
      .from("receipts-challan32a")
      .getPublicUrl(storagePath);

    return {
      url: publicData.publicUrl,
      sha256,
      fileName: file.name,
      fileSize: file.size
    };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}
