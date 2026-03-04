import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Only this email can access the dashboard
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL ?? "itay.van.dar@gmail.com";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Whitelist check — only Itay gets in
      if (user.email !== ALLOWED_EMAIL) {
        return false;
      }
      return true;
    },
    async session({ session, token }) {
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
