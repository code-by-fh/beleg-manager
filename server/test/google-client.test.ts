import { describe, it, expect } from "vitest";
import { buildOAuth2ClientFromSession } from "../src/google/client.js";

describe("buildOAuth2ClientFromSession", () => {
  it("sets credentials from session fields", () => {
    const client = buildOAuth2ClientFromSession(
      { clientId: "cid", clientSecret: "cs", callbackUrl: "http://x/cb" },
      { accessToken: "at", refreshToken: "rt", accessTokenExpiry: 1234 }
    );
    const creds = client.credentials;
    expect(creds.access_token).toBe("at");
    expect(creds.refresh_token).toBe("rt");
    expect(creds.expiry_date).toBe(1234);
  });
});
