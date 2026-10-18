import LoginForm from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
  return <LoginForm googleEnabled={googleEnabled} demoEnabled={process.env.NODE_ENV !== "production"} />;
}