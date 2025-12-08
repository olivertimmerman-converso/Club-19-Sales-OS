import { redirect } from "next/navigation";

export default function HomePage() {
  // Redirect authenticated users to Deal Studio (Sales Atelier)
  // Middleware will redirect unauthenticated users to sign-in
  redirect("/trade/new");
}
