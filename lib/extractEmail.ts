const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export function findEmailAddressInJson(value: unknown, depth = 0, maxDepth = 10): string | null {
  if (depth > maxDepth || value == null) return null;

  if (typeof value === "string") {
    const t = value.trim();
    return EMAIL_RE.test(t) ? t : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEmailAddressInJson(item, depth + 1, maxDepth);
      if (found) return found;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  const preferredKeys = [
    "email",
    "user_email",
    "userEmail",
    "mail",
    "username",
    "primary_email",
    "contact_email",
    "email_address",
    "e_mail",
    "work_email",
  ];

  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    const found = findEmailAddressInJson(value[key], depth + 1, maxDepth);
    if (found) return found;
  }

  for (const key of Object.keys(value)) {
    if (preferredKeys.includes(key)) continue;
    const found = findEmailAddressInJson(value[key], depth + 1, maxDepth);
    if (found) return found;
  }

  return null;
}
