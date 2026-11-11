"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { handOff } from "@/components/EmailInput";
import { toast } from "@/components/work";
import { readEmailFile } from "@/lib/mailfile";

/** Drop an email file on any page: on a case it becomes a reply, anywhere else it starts a new case. */
export default function GlobalDrop() {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    // The Add and Reply pages handle drops themselves.
    if (path === "/add" || /\/reply$/.test(path)) return;
    let depth = 0;
    const hasFile = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const inPicker = (e: DragEvent) => !!(e.target as HTMLElement | null)?.closest?.(".attp, .dialog, .pop");
    const enter = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth++;
      document.body.classList.add("filedrag");
    };
    const leave = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) document.body.classList.remove("filedrag");
    };
    const over = (e: DragEvent) => {
      if (hasFile(e)) e.preventDefault();
    };
    const drop = async (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth = 0;
      document.body.classList.remove("filedrag");
      if (inPicker(e) || e.defaultPrevented) return;
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (!f) return toast("That didn't come through as a file. Drag the email to your desktop first, then drop it here, or paste the text.");
      toast("Opening the email…");
      const r = await readEmailFile(f);
      if ("error" in r) return toast(r.error);
      handOff(r.text, { name: f.name, size: f.size, note: r.note, blob: f });
      const m = path.match(/^\/cases\/(\d+)$/);
      router.push(m ? `/cases/${m[1]}/reply` : "/add");
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      document.body.classList.remove("filedrag");
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [path, router]);
  return null;
}
