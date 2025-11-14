import { useTheme } from "next-themes";
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeToggle = useMemo(
    () => () => {
      if (isTransitioning) return;

      setIsTransitioning(true);
      const newTheme = theme === "dark" ? "light" : "dark";
      setTheme(newTheme);

      setTimeout(() => setIsTransitioning(false), 150);
    },
    [theme, setTheme, isTransitioning]
  );

  const IconComponent = useMemo(() => {
    const currentTheme = theme ?? "light";
    return currentTheme === "dark" ? Sun : Moon;
  }, [theme]);

  if (!mounted) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleThemeToggle}
      disabled={isTransitioning}
      className={`
        fixed bottom-4 right-4 z-50 rounded-full w-12 h-12 
        hover:scale-105 transition-all duration-200 shadow-lg
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
        ${isTransitioning ? "cursor-wait opacity-75" : "cursor-pointer"}
        ${
          theme === "dark"
            ? "border-gray-600 bg-gray-800 hover:bg-gray-700 text-black-400"
            : "border-gray-300 bg-white hover:bg-gray-50 text-white-600"
        }
      `}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <IconComponent
        className={`h-5 w-5 transition-transform duration-200 ${
          isTransitioning ? "scale-90" : "scale-100"
        }`}
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
