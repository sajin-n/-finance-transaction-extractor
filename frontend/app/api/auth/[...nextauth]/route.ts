import NextAuth, { type DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

interface CustomUser {
  id: string;
  email: string;
  token: string;
}

// Extend NextAuth types
declare module "next-auth" {
  interface Session extends DefaultSession {
    accessToken?: string;
    user?: DefaultSession["user"] & {
      id?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    id?: string;
  }
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          console.log("[AUTH] authorize called with email:", credentials?.email);
          const res = await fetch(
            "http://localhost:3000/api/auth/custom-sign-in",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Origin": "http://localhost:3001"
              },
              body: JSON.stringify({
                email: credentials?.email,
                password: credentials?.password
              })
            }
          );

          if (!res.ok) {
            const text = await res.text();
            console.error("[AUTH] Auth failed:", res.status, text);
            return null;
          }

          const data = await res.json();
          console.log("[AUTH] authorize response data keys:", Object.keys(data));
          console.log("[AUTH] token present:", !!data.token);
          
          // Custom sign-in returns { user, token }
          if (!data.user || !data.token) {
            console.error("[AUTH] Invalid response:", data);
            return null;
          }

          console.log("[AUTH] Authorize success:", data.user.email, "token preview:", data.token.substring(0, 50) + "...");

          const returnObj = {
            id: data.user.id,
            email: data.user.email,
            token: data.token
          };
          console.log("[AUTH] Returning user object:", { id: returnObj.id, email: returnObj.email, hasToken: !!returnObj.token });
          return returnObj;
        } catch (error) {
          console.error("[AUTH] Auth error:", error);
          return null;
        }
      }
    })
  ],
  pages: {
    signIn: "/login",
    error: "/login"
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60 // 30 days
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET || "dev-secret-min-32-chars-long-xxxxxxx"
  },
  secret: process.env.NEXTAUTH_SECRET || "dev-secret-min-32-chars-long-xxxxxxx",
  callbacks: {
    async jwt({ token, user }) {
      console.log("[NEXTAUTH JWT] Called, user:", !!user, "token.sub:", token.sub);
      if (user) {
        console.log("[NEXTAUTH JWT] User object received:", JSON.stringify(user));
        const customUser = user as unknown as CustomUser;
        console.log("[NEXTAUTH JWT] customUser.token type:", typeof customUser.token);
        console.log("[NEXTAUTH JWT] customUser.token exists:", !!customUser.token);
        token.id = customUser.id;
        // Store the Better Auth token as accessToken for API calls
        token.accessToken = customUser.token;
        console.log("[NEXTAUTH JWT] Token.accessToken set to:", !!token.accessToken);
        if (customUser.token) {
          console.log("[NEXTAUTH JWT] Token updated with accessToken, preview:", customUser.token.substring(0, 50) + "...");
        }
      } else {
        // On subsequent calls, preserve the accessToken if it exists
        console.log("[NEXTAUTH JWT] No user object, checking for existing accessToken");
        console.log("[NEXTAUTH JWT] Current token keys:", Object.keys(token));
        console.log("[NEXTAUTH JWT] Token.accessToken exists:", !!token.accessToken);
        if (token.accessToken) {
          console.log("[NEXTAUTH JWT] Preserving existing accessToken");
        }
      }
      console.log("[NEXTAUTH JWT] Returning token with accessToken:", !!token.accessToken);
      return token;
    },
    async session({ session, token }) {
      console.log("[NEXTAUTH SESSION] Called, token keys:", Object.keys(token));
      console.log("[NEXTAUTH SESSION] Token accessToken present:", !!token.accessToken);
      
      if (session.user) {
        session.user.id = token.id || "";
      }
      
      // Store accessToken on session - this is critical for frontend API calls
      session.accessToken = token.accessToken;
      
      console.log("[NEXTAUTH SESSION] Session updated with accessToken:", !!token.accessToken);
      if (token.accessToken) {
        console.log("[NEXTAUTH SESSION] Token preview:", token.accessToken.substring(0, 50) + "...");
      }
      console.log("[NEXTAUTH SESSION] Returning session with keys:", Object.keys(session));
      console.log("[NEXTAUTH SESSION] Session accessToken on return:", !!session.accessToken);
      return session;
    }
  }
});

export { handler as GET, handler as POST };

