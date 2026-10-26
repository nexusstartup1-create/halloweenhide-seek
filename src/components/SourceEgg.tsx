"use client";
import { useEffect } from "react";
import { REPO_URL } from "@/lib/repo";

/** Easter egg for anyone who opens the browser console. Printed once. */
export function SourceEgg() {
  useEffect(() => {
    try {
      console.log(
        "%c🧞 Genio della lampada",
        "font-size:26px;font-weight:800;color:#ff7a18;text-shadow:0 2px 10px rgba(255,122,24,.5)",
      );
      console.log(
        "%cCurioso del codice? Night Hunt è open source.\nVieni a vederlo (e a dare una mano) su GitHub 👇",
        "font-size:14px;line-height:1.5;color:#e8e8ea",
      );
      console.log(`%c${REPO_URL}`, "font-size:14px;color:#8cf25a;font-weight:700");
    } catch {}
  }, []);
  return null;
}
