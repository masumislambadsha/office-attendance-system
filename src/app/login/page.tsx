import LoginForm from "@/components/login-form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: Props) {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
  const query = await searchParams;
  const registeredEmail = typeof query.registered === "string" ? query.registered : "";
  return (
    <LoginForm
      googleEnabled={googleEnabled}
      demoEnabled={process.env.NODE_ENV !== "production"}
      registeredEmail={registeredEmail}
    />
  );
}