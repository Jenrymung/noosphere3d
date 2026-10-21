/**
 * Check for updates asks the operating system to open this page. The app does not request it.
 */
export const RELEASES_PAGE_URL = "https://github.com/Jenrymung/noosphere3d/releases";

export async function openReleasesPage(): Promise<void> {
  const tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (tauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(RELEASES_PAGE_URL);
    return;
  }
  window.open(RELEASES_PAGE_URL, "_blank", "noopener,noreferrer");
}
