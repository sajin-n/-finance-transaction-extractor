import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import TransactionsClientEnhanced from "./transactions-client-enhanced";
import LogoutButton from "./logout-button";

export default async function HomePage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Transaction Extractor</h1>
            <p className="text-gray-500 mt-1">AI-powered bank statement processing</p>
          </div>
          <LogoutButton />
        </div>

        <TransactionsClientEnhanced />
      </div>
    </main>
  );
}