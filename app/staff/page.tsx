/**
 * Club 19 Sales OS - Staff App Root Page
 *
 * Redirects to appropriate dashboard based on user role
 */

import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/getUserRole";
import { getHomepage } from "@/lib/rbac";

export default async function StaffRootPage() {
  const role = await getUserRole();

  if (!role) {
    redirect("/sign-in");
  }

  const homepage = getHomepage(role);
  redirect(homepage);
}
