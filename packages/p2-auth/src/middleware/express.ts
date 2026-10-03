import type { Request, Response, NextFunction } from "express";
import type { SISNAConfig, SISNASignature } from "../types.js";
import { createNonce, InMemoryNonceStore, isNonceValid } from "../nonce.js";
import { verifySISNACredentials, buildSISNATypedData } from "../verifier.js";

export interface SISNAExpressConfig extends SISNAConfig {
  /** Express route path that requires auth (e.g. "/api/auth") */
  authPath: string;
  /** Path to request a new nonce (default: "/api/auth/nonce") */
  noncePath?: string;
}

export interface SISNAExpressMiddleware {
  /** Handler to request a nonce */
  getNonce: (req: Request, res: Response) => void;
  /** Auth middleware for protected routes */
  authenticate: (req: Request, res: Response, next: NextFunction) => void;
  /** Handler to verify a signature and receive a receipt */
  verify: (req: Request, res: Response) => void;
}

export function createSISNAExpressMiddleware(
  config: SISNAExpressConfig,
): SISNAExpressMiddleware {
  const {
    registryClient,
    nonceTTL = 300,
    nonceStore = new InMemoryNonceStore(),
    authPath,
    noncePath = "/api/auth/nonce",
  } = config;

  /** GET /api/auth/nonce — return a fresh signed nonce */
  const getNonce = (_req: Request, res: Response) => {
    const entry = createNonce(nonceTTL);
    nonceStore.set(entry.nonce, entry);
    // Periodic cleanup of expired nonces
    nonceStore.cleanup();
    res.json({
      nonce: entry.nonce,
      expiresAt: entry.expiresAt,
      issuedAt: entry.issuedAt,
    });
  };

  /** POST /api/auth/verify — verify signature and return receipt */
  const verify = async (req: Request, res: Response) => {
    const { address, signature, nonce, statement, uri, domain, version } =
      req.body as {
        address: string;
        signature: SISNASignature;
        nonce: string;
        statement?: string;
        uri?: string;
        domain?: string;
        version?: string;
      };

    if (!address || !signature || !nonce) {
      res.status(400).json({ error: "Missing required fields: address, signature, nonce" });
      return;
    }

    const storedNonce = nonceStore.get(nonce);
    if (!storedNonce) {
      res.status(401).json({ error: "Invalid or expired nonce" });
      return;
    }

    if (!isNonceValid(storedNonce)) {
      nonceStore.invalidate(nonce);
      res.status(401).json({ error: "Nonce has expired" });
      return;
    }

    // Invalidate immediately to prevent replay
    nonceStore.invalidate(nonce);

    const message = {
      address,
      nonce,
      statement,
      uri,
      domain,
      version,
    };

    // Log typed data for debugging / client reconstruction
    console.debug("SISNA typed data:", JSON.stringify(buildSISNATypedData(message), null, 2));

    try {
      const receipt = await verifySISNACredentials(message, signature, registryClient);
      res.json(receipt);
    } catch (err) {
      console.error("SISNA verification error:", err);
      res.status(500).json({ error: "Verification failed" });
    }
  };

  /** Middleware to enforce auth on protected routes */
  const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    if (req.path === noncePath) {
      return next();
    }

    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("SISNA ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }

    const token = authHeader.slice(6);
    // Token format: address:signature.r:signature.s
    const [address, r, s] = token.split(":");
    if (!address || !r || !s) {
      res.status(401).json({ error: "Malformed SISNA token" });
      return;
    }

    // For this middleware variant, the client must have obtained the nonce
    // via /api/auth/nonce beforehand and included it in the request body.
    const { nonce } = req.body as { nonce?: string };
    if (!nonce) {
      res.status(401).json({ error: "Missing nonce in request body" });
      return;
    }

    const storedNonce = nonceStore.get(nonce);
    if (!storedNonce || !isNonceValid(storedNonce)) {
      res.status(401).json({ error: "Invalid or expired nonce" });
      return;
    }
    nonceStore.invalidate(nonce);

    req.identity = { address } as any;
    next();
  };

  return { getNonce, authenticate, verify };
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      identity?: { address: string };
    }
  }
}
