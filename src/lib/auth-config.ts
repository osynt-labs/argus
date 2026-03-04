import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in .env (local) or via Secret Manager (production).`
    );
  }
  return value;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const validUser = requireEnv("ARGUS_USERNAME");
        const validPass = requireEnv("ARGUS_PASSWORD");

        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;

        const usernameMatch =
          username !== undefined &&
          username.length > 0 &&
          username === validUser;
        const passwordMatch =
          password !== undefined &&
          password.length > 0 &&
          password === validPass;

        if (usernameMatch && passwordMatch) {
          return { id: "1", name: validUser };
        }
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
});
