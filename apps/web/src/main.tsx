import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { applySavedAppearance } from "./data/appearance.ts";
import "./design/base.css";
import { App } from "./shell/App.tsx";

const Gallery = lazy(() => import("./gallery/Gallery.tsx").then((m) => ({ default: m.Gallery })));

applySavedAppearance();
registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {location.pathname.startsWith("/gallery") ? (
        <Suspense>
          <Gallery />
        </Suspense>
      ) : (
        <App />
      )}
    </QueryClientProvider>
  </StrictMode>,
);
