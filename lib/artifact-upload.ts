import {
  detectArtifact,
  basenameWithoutExt,
  type Detected,
} from "@/lib/detect-artifact";

export type LoadedFile = {
  name: string;
  baseName: string;
  size: number;
  content: string;
  detected: Detected;
};

export const MAX_UPLOAD_BYTES = 10_000_000; // 10 MB
export const MAX_UPLOAD_MB = (MAX_UPLOAD_BYTES / 1_000_000).toFixed(0);

// Full allowlist used by the desktop dropzone. Includes .svg (an image MIME),
// which is fine on desktop but makes mobile browsers offer the camera/photos.
export const ACCEPT_EXTENSIONS =
  ".html,.htm,.md,.markdown,.mdx,.ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.go,.rs,.css,.scss,.json,.sh,.bash,.zsh,.sql,.yml,.yaml,.toml,.xml,.svg,.java,.kt,.swift,.rb,.php,.c,.h,.cpp,.hpp,.cs,.txt";

// Document-only allowlist for the native mobile picker: same set minus .svg so
// iOS/Android open the Files/document picker instead of the photo library.
export const ACCEPT_DOCUMENTS =
  ".html,.htm,.md,.markdown,.mdx,.ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.go,.rs,.css,.scss,.json,.sh,.bash,.zsh,.sql,.yml,.yaml,.toml,.xml,.java,.kt,.swift,.rb,.php,.c,.h,.cpp,.hpp,.cs,.txt";

export function looksTexty(file: File): boolean {
  if (!file.type) return true;
  return (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/xml" ||
    file.type === "image/svg+xml" ||
    /javascript|typescript|x-sh|x-yaml|toml/i.test(file.type)
  );
}

export function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("ERR_FILE_READ"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

/**
 * Validate + read + detect a picked file. Throws an Error whose message is one
 * of the `ERR_FILE_*` i18n codes so callers can translate it for a toast.
 */
export async function loadFile(picked: File): Promise<LoadedFile> {
  if (!looksTexty(picked)) throw new Error("ERR_FILE_TEXT_ONLY");
  if (picked.size > MAX_UPLOAD_BYTES) throw new Error("ERR_FILE_MAX_SIZE");
  const content = await readAsText(picked);
  if (!content.trim()) throw new Error("ERR_FILE_EMPTY");
  return {
    name: picked.name,
    baseName: basenameWithoutExt(picked.name),
    size: picked.size,
    content,
    detected: detectArtifact(picked.name, content),
  };
}
