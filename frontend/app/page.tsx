import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import TransactionsClient from "./transactions-client";
import LogoutButton from "./logout-button";

export default async function HomePage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="p-10 max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Transaction Extractor</h1>
        <LogoutButton />
      </div>

      <TransactionsClient />
    </main>
  );
}