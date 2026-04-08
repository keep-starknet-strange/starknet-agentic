pragma circom 2.1.6;

include "circomlib/poseidon.circom";

// Privacy Pool circuit — fixed version with proper binary constraints
// Commitment = Poseidon(secret, nullifier)
// Withdrawal proves knowledge of (secret, nullifier) in Merkle tree
// without revealing them. Nullifier hash prevents double-spend.

template MerkleTreeInclusionProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];  // 0 = left, 1 = right
    signal output root;

    signal hashes[levels + 1];
    hashes[0] <== leaf;

    signal left[levels];
    signal right[levels];
    
    for (var i = 0; i < levels; i++) {
        // CRITICAL FIX: Binary constraint on path indices
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        
        // Swap based on index: if index=0, leaf goes left; if index=1, leaf goes right
        left[i] <== pathElements[i] + pathIndices[i] * (hashes[i] - pathElements[i]);
        right[i] <== hashes[i] + pathIndices[i] * (pathElements[i] - hashes[i]);
        
        // Hash the pair
        component hasher = Poseidon(2);
        hasher.inputs[0] <== left[i];
        hasher.inputs[1] <== right[i];
        hashes[i + 1] <== hasher.out;
    }
    
    root <== hashes[levels];
}

template PrivacyWithdraw(levels) {
    // Private inputs
    signal input secret;
    signal input nullifier;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    
    // Public inputs
    signal input merkleRoot;
    signal input nullifierHash;
    signal input recipient;
    
    // Compute commitment
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;
    
    // Compute nullifier hash
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    
    // Verify nullifier hash matches
    nullifierHash === nullifierHasher.out;
    
    // Verify Merkle inclusion
    component merkleProof = MerkleTreeInclusionProof(levels);
    merkleProof.leaf <== commitmentHasher.out;
    for (var i = 0; i < levels; i++) {
        merkleProof.pathElements[i] <== pathElements[i];
        merkleProof.pathIndices[i] <== pathIndices[i];
    }
    
    merkleRoot === merkleProof.root;
}

component main {public [merkleRoot, nullifierHash, recipient]} = PrivacyWithdraw(20);
