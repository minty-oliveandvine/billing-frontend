"use client";

import { useEffect, useState } from "react";
import { getAuth } from "./auth";

const ALL_BILL_ROLES = new Set(["cashier", "shop_manager", "accountant", "admin", "super_admin"]);
const ELEVATED_ROLES = new Set(["accountant", "admin", "super_admin"]);

const API_BASE =
  process.env.NEXT_PUBLIC_MODULE2_BACKEND_URL ?? "http://localhost:8000";

type JwtClaims = {
  role: string;
  systemRole: string;
  isViewOnly: boolean | null;
  isSystemSuperuser: boolean;
};

/**
 * Decode the billing JWT and surface the claims relevant to permissions.
 *
 * Returns neutral defaults on any decode error so the caller never crashes.
 * ``isViewOnly`` is read directly from the token because the backend already
 * computes it correctly per-entity (system superuser AND no UserEntity row),
 * so the frontend should trust it rather than re-deriving from system_role.
 */
function getPermissionClaims(): JwtClaims {
  const empty: JwtClaims = {
    role: "",
    systemRole: "",
    isViewOnly: null,
    isSystemSuperuser: false,
  };
  try {
    const auth = getAuth();
    if (!auth?.token) return empty;
    const parts = auth.token.split(".");
    if (parts.length !== 3) return empty;
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    return {
      role: typeof payload.role === "string" ? payload.role : "",
      systemRole: typeof payload.system_role === "string" ? payload.system_role : "",
      isViewOnly:
        typeof payload.is_view_only === "boolean" ? payload.is_view_only : null,
      isSystemSuperuser:
        typeof payload.is_system_superuser === "boolean"
          ? payload.is_system_superuser
          : false,
    };
  } catch {
    return empty;
  }
}

export type UserRoleInfo = {
  role: string | null;
  /** accountant, admin, or super_admin */
  isElevated: boolean;
  /** any of the five defined bill roles */
  hasAnyRole: boolean;
  /**
   * True ONLY when the current user has effective view-only access on the
   * entity carried in the JWT.  This is the case when:
   *   - The user is a system superuser (system_role='superuser'), AND
   *   - They do NOT have a UserEntity row for the current entity.
   *
   * A system superuser who is also an entity member (e.g. super_admin of
   * the entity) is NOT view-only — they keep full per-entity-role CRUD.
   */
  isViewOnly: boolean;
  /**
   * Entity IDs the current user has an explicit UserEntity membership for.
   * Populated by fetching GET /api/v1/profile/me on mount.
   * Empty array until the fetch completes (or if the user is not a superuser).
   */
  memberEntityIds: string[];
  /**
   * Returns true when the user is a system superuser AND does NOT have an
   * explicit UserEntity membership for `entityId`.  In that case the UI must
   * render in read-only mode (all write controls hidden/disabled).
   *
   * Always returns false for non-superusers (they are blocked at the access
   * layer before reaching the entity, so no special UI treatment is needed).
   */
  isReadOnly: (entityId: string) => boolean;
};

/**
 * Reads the `role`, `system_role`, and `is_view_only` claims from the billing
 * JWT, fetches `member_entity_ids` from the profile endpoint for superusers,
 * and exposes derived permission flags scoped to the current entity.
 *
 * Safe to call in any client component — returns neutral defaults (`null`,
 * `false`, `false`, `false`) until the JWT is available.
 */
export function useUserRole(): UserRoleInfo {
  const [role, setRole] = useState<string | null>(null);
  const [systemRole, setSystemRole] = useState<string>("");
  const [tokenIsViewOnly, setTokenIsViewOnly] = useState<boolean | null>(null);
  const [currentEntityId, setCurrentEntityId] = useState<string>("");
  const [memberEntityIds, setMemberEntityIds] = useState<string[]>([]);

  useEffect(() => {
    const claims = getPermissionClaims();
    setRole(claims.role || null);
    setSystemRole(claims.systemRole);
    setTokenIsViewOnly(claims.isViewOnly);

    const auth = getAuth();
    setCurrentEntityId(auth?.entityId ?? "");

    // Fetch member_entity_ids only for system superusers — this determines
    // whether they are in read-only mode for entities other than the current
    // one (e.g. the bill detail page that loads after navigating in).
    if (claims.systemRole.trim().toLowerCase() === "superuser") {
      if (auth?.token) {
        fetch(`${API_BASE}/api/v1/profile/me`, {
          headers: {
            Authorization: `Bearer ${auth.token}`,
            "X-Entity-Id": auth.entityId,
          },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { member_entity_ids?: string[] } | null) => {
            if (data?.member_entity_ids) {
              setMemberEntityIds(data.member_entity_ids);
            }
          })
          .catch(() => {
            // Non-fatal: fall back to empty list (most-restrictive behaviour).
          });
      }
    }
  }, []);

  const normalized = (role ?? "").trim().toLowerCase().replace(/ /g, "_").replace(/-/g, "_");
  const normalizedSystemRole = systemRole.trim().toLowerCase();
  const isSystemSuperuser = normalizedSystemRole === "superuser";

  // Trust the JWT's is_view_only claim when present — the backend already
  // computed it correctly per-entity.  Fall back to membership intersection
  // for older tokens that don't carry the claim.
  const isViewOnly = (() => {
    if (tokenIsViewOnly !== null) return tokenIsViewOnly;
    if (!isSystemSuperuser) return false;
    if (!currentEntityId) return true;
    if (memberEntityIds.length === 0) return true;
    return !memberEntityIds.includes(currentEntityId);
  })();

  const isReadOnly = (entityId: string): boolean => {
    if (!isSystemSuperuser) return false;
    if (entityId === currentEntityId && tokenIsViewOnly !== null) {
      return tokenIsViewOnly;
    }
    if (memberEntityIds.length === 0) return true;
    return !memberEntityIds.includes(entityId);
  };

  return {
    role,
    isElevated: ELEVATED_ROLES.has(normalized) && !isViewOnly,
    hasAnyRole: ALL_BILL_ROLES.has(normalized),
    isViewOnly,
    memberEntityIds,
    isReadOnly,
  };
}
