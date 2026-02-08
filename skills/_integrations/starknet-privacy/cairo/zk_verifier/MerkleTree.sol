// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Merkle Tree Contract for Privacy Pool

contract MerkleTree {
    bytes32 public currentRoot;
    mapping(uint256 => bytes32) public leaves;
    uint256 public leafCount;
    
    // Maximum tree depth
    uint256 constant MAX_DEPTH = 64;
    
    event LeafAdded(bytes32 value, uint256 index, bytes32 newRoot);
    event RootUpdated(bytes32 oldRoot, bytes32 newRoot);
    
    constructor() {
        currentRoot = 0x0;
        leafCount = 0;
    }
    
    // Insert a new leaf
    function insert(bytes32 value) external returns (bytes32) {
        uint256 index = leafCount;
        leaves[index] = value;
        leafCount++;
        
        // Compute new root
        bytes32 root = computeRootFromLeaves();
        currentRoot = root;
        
        emit LeafAdded(value, index, root);
        
        return root;
    }
    
    // Verify merkle proof
    function verify(
        bytes32 leaf,
        uint256 index,
        bytes32[] memory proof
    ) public view returns (bool) {
        bytes32 computedHash = leaf;
        
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            
            if (index % 2 == 0) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
            
            index = index / 2;
        }
        
        return computedHash == currentRoot;
    }
    
    // Compute root from all leaves
    function computeRootFromLeaves() internal view returns (bytes32) {
        uint256 count = leafCount;
        if (count == 0) return 0x0;
        
        bytes32[] memory nodes = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            nodes[i] = leaves[i];
        }
        
        // Build tree bottom-up
        uint256 offset = 0;
        while (count > 1) {
            uint256 newCount = (count + 1) / 2;
            for (uint256 i = 0; i < newCount; i++) {
                uint256 leftIndex = offset + i * 2;
                uint256 rightIndex = leftIndex + 1;
                
                bytes32 left = nodes[leftIndex];
                bytes32 right = rightIndex < nodes.length ? nodes[rightIndex] : left;
                
                nodes[offset + i] = keccak256(abi.encodePacked(left, right));
            }
            offset += (count + 1) / 2;
            count = newCount;
        }
        
        return nodes[0];
    }
    
    // Update root directly (for synchronization with off-chain tree)
    function updateRoot(bytes32 newRoot) external {
        bytes32 oldRoot = currentRoot;
        currentRoot = newRoot;
        emit RootUpdated(oldRoot, newRoot);
    }
    
    // Get current root
    function getRoot() external view returns (bytes32) {
        return currentRoot;
    }
    
    // Get leaf at index
    function getLeaf(uint256 index) external view returns (bytes32) {
        return leaves[index];
    }
}
