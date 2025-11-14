import { Outlet } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function RootLayout() {
  return (
    <div className="min-h-screen">
      <ThemeToggle />
      <Outlet />
    </div>
  );
}
