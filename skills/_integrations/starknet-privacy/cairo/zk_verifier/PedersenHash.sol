// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Pedersen Hash Contract for BN254
// Used for commitment generation in Privacy Pool

contract PedersenHash {
    uint256 constant CONSTANT_X = 0x197e1e524a3f96c620d4d4374a31328f7c9b8e5f9a09093c5c4c6a34d37d3db;
    uint256 constant CONSTANT_Y = 0x2fe54b0b7582e4fc1a7e83cb8c7e98b7f2b3d9c5c0b4a8d3e6f2c1b0a9d8e7c;
    
    // Generator points for Pedersen hash
    uint256 constant Gx = 0x168c07b00f69d8b3e1309e4d74b8c0c9a7e9c8f7e6d5c4b3a2918170615140f;
    uint256 constant Gy = 0x0e79a9e1b8c0d9e8f7a6b5c4d3e2f1a0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c;
    
    // Convert bytes to field element
    function bytesToField(bytes memory input) internal pure returns (uint256) {
        return uint256(keccak256(input)) % 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001;
    }
    
    // Simple hash function (simplified Pedersen)
    // In production, use proper point addition on BN254
    function hash(uint256 x, uint256 y) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(x, y)));
    }
    
    // Commitment generation
    function commit(uint256 amount, uint256 salt) public pure returns (uint256) {
        return hash(amount, salt);
    }
    
    // Nullifier generation  
    function nullify(uint256 secret) public pure returns (uint256) {
        return hash(secret, 0);
    }
}
