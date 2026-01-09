import { BetterAuth } from "better-auth";

export const auth = new BetterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  jwt: {
    expiresIn: "7d"
  },
  organizations: {
    enabled: true
  }
});
