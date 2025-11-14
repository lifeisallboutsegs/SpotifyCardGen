import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="fixed top-4 right-4 z-50"
    >
      {theme === "dark" ? (
        <svg
          className="h-4 w-4"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M10.5 1.5H9.5V.5h1v1zm0 16h-1v1h1v-1zM19 9.5v1h1v-1h-1zM0 9.5v1h1v-1H0zm14.243-5.243l.707-.707L14.95 2.636l-.707.707zm-8.486 8.486l.707-.707-1.414-1.414-.707.707zm8.486 0l.707.707 1.414-1.414-.707-.707zm-8.486-8.486L5.05 5.364l1.414 1.414.707-.707zM10 5a5 5 0 110 10 5 5 0 010-10z" />
        </svg>
      ) : (
        <svg
          className="h-4 w-4"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
