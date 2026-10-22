// @vitest-environment happy-dom
import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { NOTICES_BUTTON_LABEL } from "./embeddedNotices";
import AboutPanel from "../ui/AboutPanel.svelte";

describe("About dialog licences", () => {
  let target: HTMLDivElement | null = null;
  let mounted: Record<string, unknown> | null = null;

  afterEach(async () => {
    if (mounted) await unmount(mounted);
    target?.remove();
    mounted = null;
    target = null;
  });

  it("exposes a keyboard-focusable View all licences button", async () => {
    target = document.createElement("div");
    document.body.appendChild(target);
    let opened = 0;
    mounted = mount(AboutPanel, {
      target,
      props: {
        logPath: "/tmp/error.log",
        onUpdates: () => {},
        onLicences: () => {
          opened += 1;
        },
        onClose: () => {},
      },
    });

    const button = target.querySelector<HTMLButtonElement>("#about-licences");
    expect(button).not.toBeNull();
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.type).toBe("button");
    expect(button?.textContent?.trim()).toBe(NOTICES_BUTTON_LABEL);
    expect(button?.tabIndex).toBeGreaterThanOrEqual(0);
    button?.focus();
    expect(document.activeElement).toBe(button);
    button?.click();
    expect(opened).toBe(1);
  });
});
