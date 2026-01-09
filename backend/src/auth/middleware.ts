import { auth } from "./better-auth";

export const requireAuth = auth.middleware({
  onFail: () => new Response("Unauthorized", { status: 401 })
});
