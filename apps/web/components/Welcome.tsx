"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { OUTFIT, SKIN, type Look } from "./AvatarPreview3D";

const Preview = dynamic(() => import("./AvatarPreview3D"), { ssr: false, loading: () => <p>Loading preview…</p> });
const TERMS_VERSION = "draft-0"; // placeholder until the real terms and privacy policy exist (see docs/launch-checklist.md §2)

export default function Welcome() {
  const [name, setName] = useState("");
  const [look, setLook] = useState<Look>({ skin: "tone-2", outfit: "terracotta", accessory: "none" });
  const [agree, setAgree] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [webgl, setWebgl] = useState(true);
  useEffect(() => {
    try { setWebgl(!!document.createElement("canvas").getContext("webgl2")); } catch { setWebgl(false); }
    fetch("/api/session", { method: "POST" }).catch(() => {});
  }, []);

  async function save() {
    setState("saving");
    try {
      const p = await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
        displayName: name.trim(), avatarKey: look.outfit, acceptTerms: { version: TERMS_VERSION }, acceptPrivacy: { version: TERMS_VERSION },
      }) });
      const c = await fetch("/api/character", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), story: "", appearance: look }) });
      setState(p.ok && c.ok ? "done" : "error");
    } catch { setState("error"); }
  }

  const choice = <K extends keyof Look>(key: K, values: readonly Look[K][], label: string) => (
    <fieldset style={{ border: 0, padding: 0, margin: "12px 0" }}>
      <legend style={{ fontWeight: 600 }}>{label}</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {values.map((v) => (
          <button key={String(v)} type="button" aria-pressed={look[key] === v} onClick={() => setLook({ ...look, [key]: v })}
            style={{ minHeight: 44, minWidth: 44, padding: "0 12px", borderRadius: 8, border: look[key] === v ? "3px solid #111" : "1px solid #999", background: key === "skin" ? SKIN[v as keyof typeof SKIN] : key === "outfit" ? OUTFIT[v as keyof typeof OUTFIT] : "#fff", color: key === "outfit" && v !== "cream" ? "#fff" : "#111" }}>
            {key === "accessory" ? String(v) : key === "skin" ? "" : String(v)}
          </button>
        ))}
      </div>
    </fieldset>
  );

  if (state === "done") return (<main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}><h1>Welcome, {name.trim()}</h1><p>Your character is saved.</p><a href="/explore">Open the map</a></main>);
  const valid = name.trim().length >= 2 && agree;
  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1>Create your character</h1>
      <div style={{ height: 240, background: "#f5efe6", borderRadius: 12 }}>{webgl ? <Preview look={look} /> : <p style={{ padding: 16 }}>3D preview isn’t available on this device. You can still create your character.</p>}</div>
      <label style={{ display: "block", margin: "16px 0 4px", fontWeight: 600 }} htmlFor="n">Display name</label>
      <input id="n" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoComplete="nickname" style={{ width: "100%", minHeight: 44, padding: "0 12px", fontSize: 16, boxSizing: "border-box" }} />
      {choice("skin", Object.keys(SKIN) as Look["skin"][], "Skin tone")}
      {choice("outfit", Object.keys(OUTFIT) as Look["outfit"][], "Outfit")}
      {choice("accessory", ["none", "cap", "scarf", "glasses"] as Look["accessory"][], "Accessory")}
      <label style={{ display: "flex", gap: 8, margin: "16px 0", alignItems: "flex-start" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 24, height: 24 }} />
        <span>I agree to the terms and privacy policy. <em>(Draft text: the final versions are not written yet.)</em></span>
      </label>
      <button type="button" disabled={!valid || state === "saving"} onClick={save} style={{ minHeight: 48, width: "100%", fontSize: 16, background: valid ? "#c2410c" : "#ccc", color: "#fff", border: 0, borderRadius: 8 }}>
        {state === "saving" ? "Saving…" : "Save and continue"}
      </button>
      {state === "error" && <p role="alert">Could not save. Check your name (2–32 characters) and try again.</p>}
    </main>
  );
}
