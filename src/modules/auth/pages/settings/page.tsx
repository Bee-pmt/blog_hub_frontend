import PasswordForm from "@/modules/auth/components/password-form";

export const metadata = { title: "Change password" };
export default function SettingsPage() {
  return <PasswordForm mode="change" />;
}
