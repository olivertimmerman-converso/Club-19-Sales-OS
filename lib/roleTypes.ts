/**
 * Club 19 Sales OS - Role Type Definitions
 *
 * Canonical role system - all roles stored in user.publicMetadata.staffRole
 */

export type StaffRole = "superadmin" | "admin" | "finance" | "shopper" | "founder" | "operations";

export const STAFF_ROLES: StaffRole[] = ["superadmin", "admin", "finance", "shopper", "founder", "operations"];

export function isValidStaffRole(role: any): role is StaffRole {
  return STAFF_ROLES.includes(role);
}

export function getDefaultRole(): StaffRole {
  return "shopper";
}
