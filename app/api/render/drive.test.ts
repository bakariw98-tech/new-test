import { describe, expect, test } from "vitest";
import { parseDriveFolderId } from "./drive";

describe("parseDriveFolderId", () => {
  const id = "1GOKAf_ZlsJA0okHWOzqDKmzzkqUsoQsj";

  test("accepts what Drive actually puts in the address bar", () => {
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${id}`)).toBe(id);
    expect(parseDriveFolderId(`https://drive.google.com/drive/u/0/folders/${id}`)).toBe(id);
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${id}?usp=sharing`)).toBe(id);
    expect(parseDriveFolderId(`https://drive.google.com/open?id=${id}`)).toBe(id);
  });

  test("accepts a bare id", () => {
    expect(parseDriveFolderId(id)).toBe(id);
  });

  test("tolerates the whitespace that comes with a paste", () => {
    expect(parseDriveFolderId(`  https://drive.google.com/drive/folders/${id}  `)).toBe(id);
  });

  test("rejects rather than guessing when there is no id", () => {
    for (const bad of ["", "   ", "https://drive.google.com/", "not a link", "short"]) {
      expect(parseDriveFolderId(bad)).toBeNull();
    }
  });
});
