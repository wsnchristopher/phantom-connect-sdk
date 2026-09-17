import { generateSessionId } from "./session";

describe("generateSessionId", () => {
  it("returns a value with the session_ prefix", () => {
    expect(generateSessionId()).toMatch(/^session_/);
  });

  it("returns base64url payload (no +, /, = characters)", () => {
    const id = generateSessionId();
    const body = id.replace(/^session_/, "");
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("uses crypto.getRandomValues to fill 32 bytes", () => {
    const spy = jest.spyOn(crypto, "getRandomValues");
    generateSessionId();
    expect(spy).toHaveBeenCalledTimes(1);
    const buf = spy.mock.calls[0][0] as Uint8Array;
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.byteLength).toBe(32);
    spy.mockRestore();
  });

  it("produces unique values across calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateSessionId());
    }
    expect(ids.size).toBe(100);
  });

  it("produces ~256 bits of entropy (43-char base64url payload)", () => {
    const id = generateSessionId();
    const body = id.replace(/^session_/, "");
    // 32 bytes -> ceil(32 * 4 / 3) = 43 base64url chars (no padding).
    expect(body.length).toBe(43);
    // Total length: "session_" prefix (8) + payload (43) = 51. Guards
    // against accidental prefix changes that would break callers comparing
    // session IDs for equality.
    expect(id.length).toBe("session_".length + 43);
  });
});
