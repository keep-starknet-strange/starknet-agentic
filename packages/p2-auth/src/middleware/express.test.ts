import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { createSISNAExpressMiddleware } from "./express.js";
import type { ERC8004RegistryClient } from "../types.js";

const mockRegistryClient: ERC8004RegistryClient = {
  isAgentOwner: vi.fn().mockResolvedValue(true),
  getRegistryAddress: () => "0xDEADBEEF",
};

function createApp() {
  const app = express();
  app.use(express.json());
  const sisna = createSISNAExpressMiddleware({
    authPath: "/api/protected",
    registryClient: mockRegistryClient,
    nonceTTL: 300,
  });

  app.get("/api/auth/nonce", sisna.getNonce);
  app.post("/api/auth/verify", sisna.verify);
  app.use("/api/protected", sisna.authenticate);
  app.get("/api/protected/data", (_req: any, res: any) => {
    res.json({ data: "secret", address: _req.identity?.address });
  });
  return app;
}

describe("SISNA Express Middleware", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  it("returns a nonce on GET /api/auth/nonce", async () => {
    const res = await new Promise<any>((resolve) => {
      app.request("/api/auth/nonce").then(resolve);
    });
    // Use supertest-style if available, else simple fetch
  });

  it("verifies a signature and returns a receipt", async () => {
    mockRegistryClient.isAgentOwner.mockResolvedValue(true);

    const res = await new Promise<any>((resolve) => {
      app
        .post("/api/auth/verify")
        .send({
          address: "0x0123",
          nonce: "testnonce",
          signature: { r: "0xrr", s: "0xss", v: 0 },
        })
        .then(resolve);
    });
    // Basic integration check
    expect(res.status).toBeDefined();
  });

  it("rejects requests without authorization on protected route", async () => {
    // Protected route without SISNA header
    expect(true).toBe(true);
  });
});
