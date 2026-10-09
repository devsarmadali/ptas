import fs from "node:fs";

const pngBuffer = fs.readFileSync("apps/web/public/punjab-logo.png");
const base64 = pngBuffer.toString("base64");

const tsContent = `/**
 * Official Government of the Punjab Seal / Logo
 * High-definition compressed 400x334 alpha PNG data URI for deterministic PDF rendering.
 */

export const PUNJAB_LOGO_DATA_URL =
  "data:image/png;base64,${base64}";

export const PUNJAB_LOGO_ASPECT_RATIO = 400 / 334; // 1.1976
export const PUNJAB_LOGO_WIDTH = 400;
export const PUNJAB_LOGO_HEIGHT = 334;
`;

fs.writeFileSync("apps/web/src/lib/pdf/punjab-logo.ts", tsContent);
console.log(
  "Successfully created apps/web/src/lib/pdf/punjab-logo.ts (" + tsContent.length + " chars)"
);
