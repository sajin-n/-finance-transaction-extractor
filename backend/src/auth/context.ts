import { auth } from "./better-auth";
import { prisma } from "../prisma";

/**
 * Get auth context from request headers
 * Use middleware.ts requireAuth instead for Hono routes
 */
export async function getAuthContext(headers: HeadersInit) {
  const sessionResult = await auth.api.getSession({ headers });

  if (!sessionResult || !sessionResult.user) {
    throw new Error("Unauthorized");
  }

  const userId = sessionResult.user.id;

  // Fetch user from DB to get organizationId
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true }
  });

  if (!user) {
    throw new Error("Unauthorized");
  }

  return {
    userId,
    organizationId: user.organizationId
  };
}
