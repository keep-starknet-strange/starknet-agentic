// Privacy Pool ZK Circuit
// Proves: commitment = amount + salt AND nullifier = commitment + secret

template Poseidon2() {
    signal private input in[2];
    signal output out;
    out <== in[0] + in[1];
}

template PrivacyPool() {
    // === PUBLIC INPUTS ===
    signal input nullifierPublic;    // Published nullifier
    signal input merkleRootPublic;   // Merkle tree root
    signal input amountPublic;       // Amount (can be public)
    
    // === PRIVATE INPUTS ===  
    signal input salt;               // Random salt
    signal input nullifierSecret;    // Secret for nullifier
    signal input merklePath[4];      // Merkle siblings
    signal input merkleIndices[4];    // Left/Right indicators
    
    // === STEP 1: Commitment ===
    component commitmentHasher = Poseidon2();
    commitmentHasher.in[0] <== amountPublic;
    commitmentHasher.in[1] <== salt;
    signal commitment <== commitmentHasher.out;
    
    // === STEP 2: Nullifier ===
    component nullifierHasher = Poseidon2();
    nullifierHasher.in[0] <== commitment;
    nullifierHasher.in[1] <== nullifierSecret;
    signal nullifier <== nullifierHasher.out;
    
    // === STEP 3: Verify nullifier (PUBLIC) ===
    nullifier === nullifierPublic;
    
    // === STEP 4: Merkle proof (simplified 4 levels) ===
    // Root = (((leaf + path[0]) + path[1]) + path[2]) + path[3]
    signal cur;
    cur <== commitment;
    
    signal tmp1;
    tmp1 <== cur + merklePath[0];
    
    signal tmp2;
    tmp2 <== tmp1 + merklePath[1];
    
    signal tmp3;
    tmp3 <== tmp2 + merklePath[2];
    
    signal computedRoot;
    computedRoot <== tmp3 + merklePath[3];
    
    // === STEP 5: Verify Merkle root (PUBLIC) ===
    computedRoot === merkleRootPublic;
}

component main = PrivacyPool();
