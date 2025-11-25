import { WEBHOOKS } from "./constants";

export type AuditEventType =
  | "USER_LOGIN_SUCCESS"
  | "USER_LOGIN_DENIED"
  | "USER_LOGOUT"
  | "INVOICE_CREATE_ATTEMPT"
  | "INVOICE_CREATE_SUCCESS"
  | "INVOICE_CREATE_FAILURE";

export type AuditUser = {
  email: string;
  userId: string;
  firstName?: string;
  lastName?: string;
};

export type AuditPayload = {
  eventType: AuditEventType;
  timestamp: string;
  user: AuditUser;
  eventData: Record<string, any>;
  sessionId: string;
  userAgent: string;
  url: string;
};

/**
 * Log audit event - exact implementation from prototype
 */
export async function logAuditEvent(
  eventType: AuditEventType,
  eventData: Record<string, any>,
  user: {
    email?: string | null;
    userId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
): Promise<void> {
  try {
    const auditPayload: AuditPayload = {
      eventType,
      timestamp: new Date().toISOString(),
      user: {
        email: user?.email || "unknown",
        userId: user?.userId || "unknown",
        firstName: user?.firstName || "",
        lastName: user?.lastName || "",
      },
      eventData,
      sessionId: `${user?.userId || "unknown"}_${Date.now()}`,
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "server",
      url: typeof window !== "undefined" ? window.location.href : "server",
    };

    await fetch(WEBHOOKS.AUDIT_LOG, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(auditPayload),
    });

    console.log(`[AUDIT] ${eventType}:`, auditPayload);
  } catch (error) {
    console.error("Audit logging failed:", error);
  }
}
