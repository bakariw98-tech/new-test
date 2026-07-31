import { driveMode, DRIVE_SETUP_HINT, ensureFolderPath, uploadToDrive } from "../render/drive";
import { publicOrigin } from "../render/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/upload
 *
 * Takes an actual image file and returns a URL the renderer can use, so nothing
 * has to be made publicly shareable and no agent has to carry image bytes.
 *
 * Accepts either:
 *   - multipart/form-data with a `file` field (what a browser form or curl -F sends)
 *   - JSON { data: "<base64>", name?, mimeType? }
 *
 * The file is stored in Drive under an Uploads folder. Because the server created
 * it, the server can read it back later under drive.file scope — which is what
 * makes the returned URL work without the file ever being public.
 */

const MAX_BYTES = 25 * 1024 * 1024;
const UPLOAD_FOLDER = "Renders/Uploads";

export async function POST(request: Request) {
  if (!driveMode()) {
    return Response.json({ error: DRIVE_SETUP_HINT }, { status: 503 });
  }

  let bytes: Uint8Array;
  let name: string;
  let mimeType: string;

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");

      if (!(file instanceof File)) {
        return Response.json(
          { error: "Send the image in a form field named `file`." },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      bytes = new Uint8Array(buffer.byteLength);
      bytes.set(buffer);
      name = file.name || "upload";
      mimeType = file.type || "image/png";
    } else {
      const body = (await request.json()) as { data?: string; name?: string; mimeType?: string };
      if (typeof body.data !== "string" || body.data.length === 0) {
        return Response.json(
          { error: "Send multipart/form-data with a `file` field, or JSON with a base64 `data` field." },
          { status: 400 },
        );
      }

      // Tolerate a full data: URI as well as bare base64.
      const bare = body.data.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(bare, "base64");
      bytes = new Uint8Array(buffer.byteLength);
      bytes.set(buffer);
      name = body.name ?? "upload";
      mimeType = body.mimeType ?? "image/png";
    }
  } catch (error) {
    return Response.json(
      { error: `Could not read the upload: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 400 },
    );
  }

  if (bytes.byteLength === 0) {
    return Response.json({ error: "The uploaded file was empty." }, { status: 400 });
  }
  if (bytes.byteLength > MAX_BYTES) {
    return Response.json(
      { error: `That file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB; the limit is 25 MB.` },
      { status: 413 },
    );
  }
  if (!/^image\//i.test(mimeType)) {
    return Response.json(
      { error: `Expected an image, got "${mimeType}".` },
      { status: 415 },
    );
  }

  try {
    const folderId = await ensureFolderPath(UPLOAD_FOLDER);
    const stored = await uploadToDrive({
      bytes,
      name: `${Date.now()}-${name}`,
      mimeType,
      folderId,
    });

    const origin = publicOrigin();
    return Response.json({
      url: `${origin}/api/image?drive=${stored.fileId}`,
      fileId: stored.fileId,
      name: stored.name,
      bytes: bytes.byteLength,
      // Ready to drop straight into markup.
      example: `<img src="${origin}/api/image?drive=${stored.fileId}&w=1080&h=1350" style="width:1080px;height:1350px;object-fit:cover" />`,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 502 },
    );
  }
}
