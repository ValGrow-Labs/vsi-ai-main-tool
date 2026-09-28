/**
 * Creating an organization (workspace) for a signed-in account that has none.
 *
 * Both paths run as a single SECURITY DEFINER database function, because the browser is not allowed
 * to set its own role or organization (profile guard trigger, migration 037):
 *
 *  - With an invite code: complete_onboarding(). The invite decides the role, so it is also the only
 *    way to become a platform admin.
 *  - Without one (self-service): create_own_organization(), migration 039. It takes only a name and a
 *    slug. The caller is always the signed-in user, and the role is never written: a new account stays
 *    a pilot. Until that migration is applied, the call fails with "unavailable" and the page says so.
 */

export const MAX_ORGANIZATION_NAME_LENGTH = 80;
// A slug clash is rare with a random suffix; retry a few times with a fresh one before giving up.
const SELF_SERVICE_ATTEMPTS = 3;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50);
}

/**
 * Self-service names collide easily ("Acme"), so the slug gets a short random suffix. The result
 * matches the database rule: lowercase letters, digits and hyphens, no leading or trailing hyphen.
 */
export function selfServiceSlug(name: string, random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0");
  const base = slugify(name)
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return base ? `${base}-${suffix}` : `workspace-${suffix}`;
}

export function validateOrganizationName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name for your organization.";
  if (trimmed.length > MAX_ORGANIZATION_NAME_LENGTH) return `The name can be at most ${MAX_ORGANIZATION_NAME_LENGTH} characters.`;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return "The name contains characters that aren't allowed.";
  return null;
}

export interface WorkspaceClient {
  // The Supabase builder is awaitable but is not a Promise, hence PromiseLike.
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

export type WorkspaceResult =
  | { status: "created"; path: "invite" | "self_service" }
  /** The account already has an organization (for example a repeated request): nothing was created. */
  | { status: "already_set_up" }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

// Shown to the person signing up: no function, migration or database names (those are for operators).
const UNAVAILABLE_MESSAGE = "Database setup incomplete: workspaces can't be created yet. Please contact support.";
const GENERIC_FAILURE = "Account setup failed. Please try again.";

type RpcError = { message?: string; code?: string };

/** Turns the database's error into something a person can act on. Never returns the raw database text. */
function describeError(error: RpcError): WorkspaceResult {
  const msg = error.message ?? "";

  if (error.code === "PGRST202" || /could not find the function|function .* does not exist/i.test(msg)) {
    return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
  }
  if (/already set up/i.test(msg)) return { status: "already_set_up" };
  if (/not signed in/i.test(msg) || error.code === "PGRST301") {
    return { status: "error", message: "Please sign in before creating a workspace." };
  }
  if (/disabled/i.test(msg)) return { status: "error", message: "This account is disabled. Contact support." };
  if (/profile not found/i.test(msg)) {
    return { status: "error", message: "We couldn't find your account profile. Sign out and back in, or contact support." };
  }
  if (/80 characters/i.test(msg)) return { status: "error", message: `The name can be at most ${MAX_ORGANIZATION_NAME_LENGTH} characters.` };
  if (/invalid characters/i.test(msg)) return { status: "error", message: "The name contains characters that aren't allowed." };
  if (/name is required/i.test(msg)) return { status: "error", message: "Enter a name for your organization." };
  if (/invite/i.test(msg)) {
    return { status: "error", message: "Invalid or expired invite code." };
  }
  if (error.code === "23505" || /duplicate key|unique constraint|slug is already in use|address is already in use/i.test(msg)) {
    return { status: "error", message: "Could not create the organization. Organization name or address is already in use. Try a different name." };
  }
  // Anything unrecognised is database text (SQL, constraint names, internals): never shown.
  return { status: "error", message: GENERIC_FAILURE };
}

const isSlugClash = (error: RpcError) => error.code === "23505" || /slug is already in use|address is already in use/i.test(error.message ?? "");

export async function createWorkspace(client: WorkspaceClient, input: { name: string; inviteCode?: string | null }): Promise<WorkspaceResult> {
  const nameError = validateOrganizationName(input.name);
  if (nameError) return { status: "error", message: nameError };

  const name = input.name.trim();
  const code = input.inviteCode?.trim().toUpperCase() || "";

  if (code) {
    let res;
    try {
      res = await client.rpc("complete_onboarding", { p_code: code, p_agency_name: name, p_slug: slugify(name) });
    } catch {
      return { status: "error", message: GENERIC_FAILURE };
    }
    if (!res.error) return { status: "created", path: "invite" };
    return describeError(res.error);
  }

  for (let attempt = 1; attempt <= SELF_SERVICE_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await client.rpc("create_own_organization", { p_agency_name: name, p_slug: selfServiceSlug(name) });
    } catch {
      return { status: "error", message: GENERIC_FAILURE };
    }
    if (!res.error) return { status: "created", path: "self_service" };

    const error = res.error;
    if (error.code === "PGRST202" || /could not find the function|function .* does not exist/i.test(error.message ?? "")) {
      return describeError(error);
    }
    if (isSlugClash(error) && attempt < SELF_SERVICE_ATTEMPTS) continue;
    return describeError(error);
  }
  return { status: "error", message: "Could not create the organization. Organization name or address is already in use. Try a different name." };
}
