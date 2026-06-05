"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

// One QueryClient per browser session, created lazily in state so it survives
// re-renders but is never shared across requests on the server.
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#141417",
            color: "#f3f2ef",
            border: "1px solid rgba(255,255,255,0.14)",
            fontSize: "0.85rem",
          },
          error: { iconTheme: { primary: "#fb7185", secondary: "#141417" } },
        }}
      />
    </QueryClientProvider>
  );
}
