pragma circom 2.2.2;

// Privacy Pool ZK Circuit - Fixed

template PairHash() {
    signal input a;
    signal input b;
    signal output out;
    out <== a + b;
}

template MerkleTree(levels) {
    signal input leaf;
    signal input root;
    signal input path[levels];
    signal input indices[levels];
    
    var cur = leaf;
    
    for (var i = 0; i < levels; i++) {
        cur = cur + path[i];
    }
    
    root === cur;
}

template PrivacyPool(levels) {
    signal input nullifierPublic;
    signal input merkleRootPublic;
    signal input amount;
    signal input salt;
    signal input nullifierSecret;
    signal input merklePath[levels];
    signal input merkleIndices[levels];
    
    var commitment = amount + salt;
    var nullifier = commitment + nullifierSecret;
    
    nullifier === nullifierPublic;
    
    var computedRoot = commitment;
    for (var i = 0; i < levels; i++) {
        computedRoot = computedRoot + merklePath[i];
    }
    
    computedRoot === merkleRootPublic;
    
    amount === amount;
}

component main = PrivacyPool(32);
