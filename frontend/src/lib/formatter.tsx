export function formatStorageBytes(bytes: number, decimals: number = 2): string {
  if (!bytes || bytes === 0) return '0 MB';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  // For storage gauge/display, if bytes is in MB range or smaller, show exact MB or suitable unit
  if (bytes < k * k) {
    return `${(bytes / (k * k)).toFixed(dm)} MB`;
  }

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatExactMB(bytes: number, decimals: number = 2): string {
  if (!bytes || bytes === 0) return '0.00 MB';
  return `${(bytes / (1024 * 1024)).toFixed(decimals)} MB`;
}

export function formatExactGB(bytes: number, decimals: number = 2): string {
  if (!bytes || bytes === 0) return '0.00 GB';
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(decimals)} GB`;
}
