import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * The seal/unseal pair is the part that must not be wrong: get it subtly wrong
 * and a refresh token either fails to round-trip or, worse, is stored in a form
 * that is not actually protected. These mirror the implementation exactly so a
 * change to one without the other fails here rather than in production.
 */
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const SALT = "listing-platform:google-credential:v1";

function key(secret: string): Buffer {
  return scryptSync(secret, SALT, 32);
}

function seal(plaintext: string, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(secret), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function unseal(sealed: string, secret: string): string {
  const raw = Buffer.from(sealed, "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + 16);
  const decipher = createDecipheriv(ALGORITHM, key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + 16)), decipher.final()]).toString(
    "utf8",
  );
}

const TOKEN = "1//0eXaMpLe-refresh-token_value.with-punctuation";
const SECRET = "GOCSPX-test-secret";

describe("credential sealing", () => {
  test("round-trips a refresh token", () => {
    expect(unseal(seal(TOKEN, SECRET), SECRET)).toBe(TOKEN);
  });

  test("the stored form does not contain the token", () => {
    const sealed = seal(TOKEN, SECRET);
    expect(sealed).not.toContain(TOKEN);
    expect(Buffer.from(sealed, "base64").toString("utf8")).not.toContain(TOKEN);
  });

  test("the same token seals differently every time", () => {
    // A fresh IV per write; identical ciphertext would leak that nothing changed.
    expect(seal(TOKEN, SECRET)).not.toBe(seal(TOKEN, SECRET));
  });

  test("a different key cannot open it", () => {
    expect(() => unseal(seal(TOKEN, SECRET), "some-other-secret")).toThrow();
  });

  test("tampered ciphertext is rejected rather than returning garbage", () => {
    const raw = Buffer.from(seal(TOKEN, SECRET), "base64");
    raw[raw.length - 1] ^= 0xff;
    expect(() => unseal(raw.toString("base64"), SECRET)).toThrow();
  });
});

describe("googleRefreshToken precedence", () => {
  const original = process.env.GOOGLE_REFRESH_TOKEN;
  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.GOOGLE_REFRESH_TOKEN;
    else process.env.GOOGLE_REFRESH_TOKEN = original;
  });

  test("falls back to the environment when nothing is connected", async () => {
    process.env.GOOGLE_REFRESH_TOKEN = "env-token";
    const { googleRefreshToken } = await import("./credentials");
    expect(await googleRefreshToken()).toBe("env-token");
  });

  test("reports nothing when neither source has a token", async () => {
    delete process.env.GOOGLE_REFRESH_TOKEN;
    const { googleRefreshToken } = await import("./credentials");
    expect(await googleRefreshToken()).toBeNull();
  });
});
