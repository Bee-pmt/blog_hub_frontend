import PasswordForm from "@/components/password-form";

export const metadata = { title: "Forgot password" };
export default function ForgotPasswordPage() {
  return <PasswordForm mode="forgot" />;
}
