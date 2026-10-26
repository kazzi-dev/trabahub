import type { Role } from "./index.js";

/** Everything someone can do in an organization, checked by `can()` in every route. */
export type Action =
  | "org.view" // see the organization and its member list
  | "org.rename"
  | "org.delete"
  | "invites.create"
  | "members.manage" // change roles, remove people
  | "pipelines.view"; // see members' job boards and the cohort summary

const GRANTS: Record<Role, readonly Action[]> = {
  owner: ["org.view", "org.rename", "org.delete", "invites.create", "members.manage", "pipelines.view"],
  admin: ["org.view", "org.rename", "invites.create", "members.manage", "pipelines.view"],
  coach: ["org.view", "pipelines.view"],
  member: ["org.view"],
};

export const can = (role: Role, action: Action): boolean => GRANTS[role].includes(action);

const RANK: Record<Role, number> = { member: 0, coach: 1, admin: 2, owner: 3 };

/**
 * Whether `actor` may change `target`'s role from `from` to `to`.
 * Admins manage everyone below owner and can't create owners; only owners touch owners.
 */
export function canChangeRole(actor: Role, from: Role, to: Role): boolean {
  if (!can(actor, "members.manage")) return false;
  if (actor === "owner") return true;
  return RANK[from] < RANK.owner && RANK[to] < RANK.owner;
}

/** Whether `actor` may remove a member whose role is `target`. */
export function canRemove(actor: Role, target: Role): boolean {
  if (!can(actor, "members.manage")) return false;
  return actor === "owner" || target !== "owner";
}
