import { NextResponse } from "next/server";
import { createSISNAExpressMiddleware } from "@starknet-agentic/p2-auth";

const registryClient = {
  isAgentOwner: async (_address: string) => true,
  getRegistryAddress: () => "0x04C1DB0bd04fBC33341E4603e137E670dd1723A4b710B7A43A9979008A83728",
};

const sisna = createSISNAExpressMiddleware({
  authPath: "/api/protected",
  registryClient: registryClient as any,
});

export async function GET() {
  return new Promise<any>((resolve, reject) => {
    const req: any = { headers: {}, query: {} };
    const res: any = {
      status: 200,
      _body: null,
      json: (body: any) => {
        res._body = body;
        resolve(new NextResponse(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
      },
      status: (code: number) => ({
        json: (body: any) => {
          res._body = body;
          resolve(new NextResponse(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } }));
        },
      }),
    };
    sisna.getNonce(req as any, res as any);
  });
}
