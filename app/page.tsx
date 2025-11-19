import { redirect } from "next/navigation";

export default function HomePage() {
  // Middleware has already verified auth + authorization
  // Just redirect to invoice
  redirect("/invoice");
}
