import { describe, expect, it } from "vitest"
import {
  StarknetA2AAdapter,
  createStarknetA2AAdapter,
  TaskState,
} from "../src/index.js"
import type { AgentCard, StarknetIdentity, Task } from "../src/index.js"

describe("starknet-a2a", () => {
  // ---- Exports smoke test ----

  it("exports StarknetA2AAdapter class", () => {
    expect(StarknetA2AAdapter).toBeDefined()
    expect(typeof StarknetA2AAdapter).toBe("function")
  })

  it("exports createStarknetA2AAdapter factory", () => {
    expect(typeof createStarknetA2AAdapter).toBe("function")
  })

  it("exports TaskState enum with correct values", () => {
    expect(TaskState.Submitted).toBe("submitted")
    expect(TaskState.Working).toBe("working")
    expect(TaskState.Completed).toBe("completed")
    expect(TaskState.Failed).toBe("failed")
    expect(TaskState.Canceled).toBe("canceled")
  })

  // ---- Constructor ----

  it("creates adapter instance with required config", () => {
    const adapter = createStarknetA2AAdapter({
      rpcUrl: "https://example.com/rpc",
      identityRegistryAddress: "0x123",
    })
    expect(adapter).toBeInstanceOf(StarknetA2AAdapter)
  })

  it("creates adapter instance with full config", () => {
    const adapter = createStarknetA2AAdapter({
      rpcUrl: "https://example.com/rpc",
      identityRegistryAddress: "0x123",
      reputationRegistryAddress: "0x456",
      validationRegistryAddress: "0x789",
    })
    expect(adapter).toBeInstanceOf(StarknetA2AAdapter)
  })

  // ---- createTaskFromTransaction ----

  it("creates task from transaction hash", () => {
    const adapter = createStarknetA2AAdapter({
      rpcUrl: "https://example.com/rpc",
      identityRegistryAddress: "0x123",
    })

    const task = adapter.createTaskFromTransaction("0xabc", "swap 10 ETH")

    expect(task.id).toBe("0xabc")
    expect(task.state).toBe(TaskState.Submitted)
    expect(task.prompt).toBe("swap 10 ETH")
    expect(task.transactionHash).toBe("0xabc")
    expect(task.createdAt).toBeGreaterThan(0)
    expect(task.updatedAt).toBeGreaterThan(0)
  })

  // ---- discoverAgents ----

  it("discoverAgents throws not-implemented error", async () => {
    const adapter = createStarknetA2AAdapter({
      rpcUrl: "https://example.com/rpc",
      identityRegistryAddress: "0x123",
    })

    await expect(adapter.discoverAgents()).rejects.toThrow(/indexer/i)
  })

  // ---- Type checks (compile-time + runtime) ----

  it("AgentCard type shape is correct", () => {
    const card: AgentCard = {
      name: "Test Agent",
      description: "A test agent",
      version: "1.0",
      skills: ["swap", "bridge"],
    }
    expect(card.name).toBe("Test Agent")
    expect(card.skills).toHaveLength(2)
  })

  it("StarknetIdentity type shape is correct", () => {
    const identity: StarknetIdentity = {
      registryAddress: "0x123",
      agentId: "1",
      reputationScore: 85,
      validationCount: 10,
    }
    expect(identity.registryAddress).toBe("0x123")
    expect(identity.reputationScore).toBe(85)
  })

  it("Task type shape is correct", () => {
    const task: Task = {
      id: "0xabc",
      state: TaskState.Completed,
      prompt: "do something",
      result: "done",
      createdAt: 1000,
      updatedAt: 2000,
    }
    expect(task.state).toBe("completed")
    expect(task.result).toBe("done")
  })
})
