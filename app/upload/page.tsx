"use client";

import { useState } from "react";

/**
 * A human-facing way to get a photo into the renderer.
 *
 * An AI agent cannot hand over image bytes — it would have to transcribe
 * megabytes of base64 without error — so the practical path is a person drops
 * the file here once and pastes the resulting URL into the conversation.
 */
export default function UploadPage() {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);

  async function send(file: File) {
    setStatus("uploading");
    setMessage(`Uploading ${file.name}…`);
    setUrl("");

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/upload", { method: "POST", body });
      const result = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(result.error ?? `Upload failed (HTTP ${response.status}).`);
        return;
      }

      setStatus("done");
      setUrl(result.url);
      setMessage(`${result.name} — ${(result.bytes / 1024 / 1024).toFixed(1)} MB`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  return (
    <main className="doc">
      <h1>Upload a photo</h1>
      <p className="tagline">
        Drop an image here to get a URL the renderer can use. The file goes to Drive and stays
        private — it is never made publicly shareable.
      </p>

      <label
        className={`dropzone${dragging ? " dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void send(file);
        }}
      >
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void send(file);
          }}
        />
        <strong>Drop an image</strong>
        <span>or click to choose one</span>
      </label>

      {status !== "idle" && <p className={`status-line ${status}`}>{message}</p>}

      {url && (
        <>
          <h2>Paste this into your chat</h2>
          <pre>
            <code>{url}</code>
          </pre>
          <button type="button" onClick={() => void navigator.clipboard.writeText(url)}>
            Copy URL
          </button>
        </>
      )}
    </main>
  );
}
