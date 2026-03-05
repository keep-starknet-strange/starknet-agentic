// Privacy Pool ZK Circuit
// Proves: commitment = Poseidon(amount, salt) AND nullifier = Poseidon(commitment, secret)
// Demonstrates ZK privacy with proper cryptographic hashing

pragma circom 2.0.0;

// Use real Poseidon hash and Mux1 from circomlib
include "./node_modules/circomlib/circuits/poseidon.circom";
include "./node_modules/circomlib/circuits/mux1.circom";

template PrivacyPool() {
    // === PUBLIC INPUTS ===
    signal input nullifierPublic;    // Published nullifier (reveals spent)
    signal input merkleRootPublic;   // Merkle tree root (valid membership)
    signal input amountPublic;       // Amount (public for this demo)
    
    // === PRIVATE INPUTS ===  
    signal input salt;               // Random salt (private)
    signal input nullifierSecret;    // Secret for nullifier (private)
    signal input merklePath[4];      // Merkle siblings (private)
    signal input merkleIndices[4];    // Left/Right indicators (private)
    
    // === STEP 1: Commitment using REAL POSEIDON ===
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== amountPublic;
    commitmentHasher.inputs[1] <== salt;
    signal commitment <== commitmentHasher.out;
    
    // === STEP 2: Nullifier using REAL POSEIDON ===
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== commitment;
    nullifierHasher.inputs[1] <== nullifierSecret;
    signal nullifier <== nullifierHasher.out;
    
    // === STEP 3: Verify nullifier matches public ===
    nullifier === nullifierPublic;
    
    // === STEP 4: Merkle proof using REAL POSEIDON HASHING ===
    // Use signal array to avoid signal reassignment (not allowed in Circom 2.0+)
    signal cur[5];  // cur[0] = initial, cur[1-4] = after each level
    cur[0] <== commitment;
    
    component merkleHashers[4];
    component muxLeft[4];
    component muxRight[4];
    
    for (var i = 0; i < 4; i++) {
        merkleHashers[i] = Poseidon(2);
        
        // Two Mux1 per level: left selects first hash input, right selects second
        muxLeft[i] = Mux1();
        muxRight[i] = Mux1();
        
        // muxLeft: when index=0 use cur[i], when index=1 use merklePath[i]
        muxLeft[i].c[0] <== cur[i];
        muxLeft[i].c[1] <== merklePath[i];
        muxLeft[i].s <== merkleIndices[i];
        
        // muxRight: when index=0 use merklePath[i], when index=1 use cur[i]
        muxRight[i].c[0] <== merklePath[i];
        muxRight[i].c[1] <== cur[i];
        muxRight[i].s <== merkleIndices[i];
        
        // Hash inputs: (left_mux_out, right_mux_out)
        merkleHashers[i].inputs[0] <== muxLeft[i].out;
        merkleHashers[i].inputs[1] <== muxRight[i].out;
        
        // Store result for next iteration
        cur[i + 1] <== merkleHashers[i].out;
    }
    
    // === STEP 5: Verify Merkle root matches public ===
    cur[4] === merkleRootPublic;
}

component main = PrivacyPool();
