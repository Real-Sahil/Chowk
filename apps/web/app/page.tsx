import Link from "next/link";
export default function Home() {
  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1>Chowk</h1>
      <p>Explore your city with friends. No account needed to start.</p>
      <Link href="/welcome" style={{ display: "inline-block", marginRight: 12, padding: "12px 20px", border: "2px solid #c2410c", color: "#c2410c", borderRadius: 8, textDecoration: "none" }}>Create character</Link>
      <Link href="/explore" style={{ display: "inline-block", padding: "12px 20px", background: "#c2410c", color: "#fff", borderRadius: 8, textDecoration: "none" }}>Open the map</Link>
      <p style={{ fontSize: 13, opacity: 0.7 }}>Early build: all places and trails are placeholders.</p>
    </main>
  );
}
