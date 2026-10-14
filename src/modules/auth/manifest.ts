import type { ModuleManifest } from "@/moduleTypes";
import LoginPage from "./pages/login/page";
import RegisterPage from "./pages/register/page";
import ForgotPasswordPage from "./pages/forgot-password/page";
import SettingsPage from "./pages/settings/page";
const manifest: ModuleManifest = {
  id: "auth",
  name: "Authentication",
  navItems: [],
  routes: [
    { path: "/login", component: LoginPage, title: "Sign in" },
    { path: "/register", component: RegisterPage, title: "Create an account" },
    {
      path: "/forgot-password",
      component: ForgotPasswordPage,
      title: "Forgot password",
    },
    { path: "/settings", component: SettingsPage, title: "Change password" },
  ],
};
export default manifest;
