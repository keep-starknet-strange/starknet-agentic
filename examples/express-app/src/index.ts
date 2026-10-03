/**
 * Example Express integration with SISNA middleware.
 * Demonstrates nonce issuance, signature verification, and protected routes.
 */
import express from "express";
import cors from "cors";
import {
  createSISNAExpressMiddleware,
  type ERC8004RegistryClient,
} from "@starknet-agentic/p2-auth";

// Minimal ERC-8004 registry client stub — replace with real implementation
const registryClient: ERC8004RegistryClient = {
  async isAgentOwner(address: string): Promise<boolean> {
    // In production, query the ERC-8004 registry contract on Starknet
    console.debug(`Checking agent ownership for ${address} against registry`);
    return true;
  },
  getRegistryAddress(): string {
    return "0x04C1DB0bd04fBC33341E4603E137E670DD1723A4B710B7A43A9979008A83728";
  },
};

const app = express();
app.use(cors());
app.use(express.json());

const sisna = createSISNAExpressMiddleware({
  authPath: "/api/protected",
  registryClient,
  nonceTTL: 300,
});

// 1. Request a nonce
app.get("/api/auth/nonce", sisna.getNonce);

// 2. Verify a signature
app.post("/api/auth/verify", sisna.verify);

// 3. Protected route
app.use("/api/protected", sisna.authenticate);
app.get("/api/protected/data", (req: any, res: any) => {
  res.json({
    message: "You have access!",
    address: req.identity?.address,
  });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`SISNA Express example running on port ${PORT}`);
  console.log(`  GET  http://localhost:${PORT}/api/auth/nonce`);
  console.log(`  POST http://localhost:${PORT}/api/auth/verify`);
  console.log(`  GET  http://localhost:${PORT}/api/protected/data`);
});
