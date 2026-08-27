export type PermissionEffect = "allow" | "deny";

export interface PermissionGrant {
  readonly permission: string;
  readonly effect: PermissionEffect;
  readonly source: "discord" | "role" | "user" | "owner";
}

export interface PermissionDecision {
  readonly allowed: boolean;
  readonly reason: "explicit-deny" | "explicit-allow" | "owner" | "not-granted";
  readonly matched: readonly PermissionGrant[];
}

function matches(pattern: string, permission: string): boolean {
  if (pattern === "*") return true;
  if (pattern === permission) return true;
  return pattern.endsWith(".*") && permission.startsWith(pattern.slice(0, -1));
}

export function evaluatePermission(
  permission: string,
  grants: readonly PermissionGrant[],
): PermissionDecision {
  const matched = grants.filter((grant) => matches(grant.permission, permission));
  if (matched.some((grant) => grant.effect === "deny")) {
    return { allowed: false, reason: "explicit-deny", matched };
  }
  if (matched.some((grant) => grant.source === "owner" && grant.effect === "allow")) {
    return { allowed: true, reason: "owner", matched };
  }
  if (matched.some((grant) => grant.effect === "allow")) {
    return { allowed: true, reason: "explicit-allow", matched };
  }
  return { allowed: false, reason: "not-granted", matched };
}
