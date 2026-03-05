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
    // Use Mux1 selector to avoid branching on signals (soundness fix)
    signal cur;
    cur <== commitment;
    
    component merkleHashers[4];
    component muxSelectors[4];
    
    for (var i = 0; i < 4; i++) {
        merkleHashers[i] = Poseidon(2);
        muxSelectors[i] = Mux1();
        
        // Mux1 selects: out = c[s] (c[0] if s=0, c[1] if s=1)
        muxSelectors[i].c[0] <== cur;           // left option
        muxSelectors[i].c[1] <== merklePath[i];  // right option
        muxSelectors[i].s <== merkleIndices[i];   // selector (0=left, 1=right)
        
        // First input: selected value (cur or merklePath[i])
        merkleHashers[i].inputs[0] <== muxSelectors[i].out;
        
        // Second input: the OTHER value (NOT the selected one)
        // Use another Mux1 to select: if s=0 use merklePath[i], if s=1 use cur
        // This avoids branching on signals - both branches are constrained
        component secondMux = Mux1();
        secondMux.c[0] <== merklePath[i];
        secondMux.c[1] <== cur;
        secondMux.s <== merkleIndices[i];
        merkleHashers[i].inputs[1] <== secondMux.out;
        
        cur <== merkleHashers[i].out;
    }
    
    // === STEP 5: Verify Merkle root matches public ===
    cur === merkleRootPublic;
}

component main = PrivacyPool();
