import axios, { type AxiosError } from "axios";
import toast from "react-hot-toast";

// Shared browser-side axios instance for the dashboard's own API routes. Same
// origin, so the httpOnly `hub_token` cookie rides along automatically;
// `withCredentials` is set explicitly to make that intent obvious.
export const http = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// One place to surface API failures to the user. Every fetcher and mutation
// goes through this instance, so a toast here covers them all — callers only
// handle the data path (and TanStack Query handles rollback/retry).
http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string }>) => {
    // Aborted requests aren't failures — TanStack Query cancels in-flight reads
    // on unmount/refetch via AbortSignal, which surfaces here as a cancel.
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }
    if (typeof window !== "undefined") {
      // Reuse one toast id so a repeated failure (e.g. a 5s poll during an
      // outage) refreshes a single toast instead of stacking dozens.
      toast.error(messageForError(error), { id: "api-error" });
    }
    return Promise.reject(error);
  },
);

// Prefer the route's `{ error }` message, fall back to the HTTP status, then to
// a generic network message when there's no response at all.
function messageForError(error: AxiosError<{ error?: string }>): string {
  const serverMessage = error.response?.data?.error;
  if (serverMessage) return serverMessage;
  if (error.response) return `Request failed (${error.response.status})`;
  return "Network error — check your connection";
}
