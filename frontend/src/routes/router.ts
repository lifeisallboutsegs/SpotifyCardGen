import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import RootLayout from "../layouts/RootLayout";
import LoginPage from "../pages/LoginPage";
import GeneratePage from "../pages/GeneratePage";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LoginPage,
});

const generateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/generate",
  component: GeneratePage,
});

const routeTree = rootRoute.addChildren([loginRoute, generateRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
