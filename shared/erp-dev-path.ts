/** Decode a path for registry-scope matching while preserving each segment boundary. */
export function decodeTablePath(path: string): string | undefined {
  if (path.includes('//')) return undefined;
  try {
    const segments = path.split('/').map(decodeURIComponent);
    if (
      segments.some((value) => value === '.' || value === '..' || /[\\/%?#;\u0000-\u001f\u007f]/.test(value))
    )
      return undefined;
    return segments.join('/');
  } catch {
    return undefined;
  }
}
