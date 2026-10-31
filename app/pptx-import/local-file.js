// IndexedDB accepts ArrayBuffer in WebKit sessions that reject Blob/File values.
export async function sha256Bytes(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, n => n.toString(16).padStart(2, '0')).join('');
}

// Older libraries stored a Blob. Read either representation without rewriting a revision.
export async function readLocalFile(row, {mimeType, byteLength, sha256}) {
  const bytes = row.bytes ?? (row.blob instanceof Blob ? await row.blob.arrayBuffer() : null);
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== byteLength || await sha256Bytes(bytes) !== sha256) return null;
  return new Blob([bytes], {type: mimeType});
}
