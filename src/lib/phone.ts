/** Normalises Ethiopian mobile numbers to +251XXXXXXXXX. Returns null if invalid. */
export function normalizeEthiopianMobile(input: string): string | null {
  const compact = input.replace(/[\s()-]/g, "");
  const m = /^(?:\+?251|0)?([79]\d{8})$/.exec(compact);
  return m ? `+251${m[1]}` : null;
}
