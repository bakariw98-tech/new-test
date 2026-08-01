export default function ListingNotFound() {
  return (
    <main style={{ padding: "80px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>This listing is no longer available</h1>
      <p style={{ opacity: 0.7, lineHeight: 1.6 }}>
        The property page you are looking for has been taken down or the address is wrong. If you
        followed a link from a flyer or a social post, contact the agent directly.
      </p>
    </main>
  );
}
