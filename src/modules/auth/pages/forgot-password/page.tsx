import PasswordForm from "@/modules/auth/components/password-form";

export const metadata = { title: "Forgot password" };
export default function ForgotPasswordPage() {
  return <PasswordForm mode="forgot" />;
}
