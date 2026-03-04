import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class McpSidecar {
  private client: Client | null = null;

  constructor(
    private readonly mcpEntry: string,
    private readonly env: Record<string, string>,
  ) {}

  async connect(label: string): Promise<void> {
    const mergedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") mergedEnv[key] = value;
    }
    for (const [key, value] of Object.entries(this.env)) {
      mergedEnv[key] = value;
    }

    const transport = new StdioClientTransport({
      command: "node",
      args: [this.mcpEntry],
      env: mergedEnv,
    });

    const client = new Client(
      { name: `secure-defi-demo-${label}`, version: "0.1.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
    this.client = client;
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = null;
  }

  async listTools(): Promise<string[]> {
    if (!this.client) throw new Error("MCP client is not connected");
    const response = await this.client.listTools();
    return (response.tools || []).map((tool) => tool.name);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error("MCP client is not connected");
    const response = (await this.client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
    };

    if (response?.isError) {
      const toolMessage = response?.content?.find((part) => part.type === "text")?.text;
      throw new Error(toolMessage || `Tool ${name} returned an error`);
    }

    const text = response?.content?.find((part) => part.type === "text")?.text;
    if (!text) return response;

    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
}
