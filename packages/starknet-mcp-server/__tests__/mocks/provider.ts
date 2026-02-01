import { vi } from 'vitest';

export const mockProvider = {
  callContract: vi.fn(),
  getTransactionReceipt: vi.fn(),
  waitForTransaction: vi.fn(),
};

export const mockContract = {
  balanceOf: vi.fn(),
  decimals: vi.fn(),
};

export const createMockContract = () => ({
  balanceOf: vi.fn(),
  decimals: vi.fn(),
  transfer: vi.fn(),
});
