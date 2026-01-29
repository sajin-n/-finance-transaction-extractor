import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import EnterpriseDashboard from "./enterprise-dashboard";

export default async function HomePage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return <EnterpriseDashboard />;
}