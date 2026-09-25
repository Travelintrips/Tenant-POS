/**
 * Defensive API-shape helpers.
 * Runtime responses can temporarily differ during rolling deploys or when an
 * older browser bundle talks to a newer API. Keep render paths from crashing
 * on ".map is not a function" by normalizing collection payloads at the edge.
 */
export function asArray<T>(value: unknown, nestedKeys: string[] = ["data", "items", "rows", "results"]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of nestedKeys) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

export function arrayField<T>(value: unknown, key: string): T[] {
  if (!value || typeof value !== "object") return [];
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field) ? field as T[] : [];
}
