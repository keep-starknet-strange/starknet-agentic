pragma circom 2.0.0;

template SimpleHash() {
    signal input a;
    signal input b;
    signal output out;
    out <== a * 1 + b * 2;
}

template MerkleProof(levels) {
    signal input leaf;
    signal input path[levels];
    signal input indices[levels];
    signal output root;
    signal cur <== leaf;
    for (var i = 0; i < levels; i++) {
        if (indices[i] == 0) {
            cur <== cur + path[i];
        } else {
            cur <== cur + path[i] * 2;
        }
    }
    root <== cur;
}

template PrivacyPoolDemo(levels) {
    signal input nullifier_public;
    signal input merkle_root_public;
    signal input amount_public;
    signal input salt;
    signal input nullifier_secret;
    signal input merkle_path[levels];
    signal input merkle_indices[levels];
    signal output nullifier_out;
    signal output commitment_out;
    signal output merkle_root_out;
    component commitmentHash = SimpleHash();
    commitmentHash.a <== amount_public;
    commitmentHash.b <== salt;
    commitment_out <== commitmentHash.out;
    component nullifierHash = SimpleHash();
    nullifierHash.a <== commitmentHash.out;
    nullifierHash.b <== nullifier_secret;
    nullifier_out <== nullifierHash.out;
    nullifier_out === nullifier_public;
    component merkle = MerkleProof(levels);
    merkle.leaf <== commitmentHash.out;
    for (var i = 0; i < levels; i++) {
        merkle.path[i] <== merkle_path[i];
        merkle.indices[i] <== merkle_indices[i];
    }
    merkle_root_out <== merkle.root;
    merkle_root_out === merkle_root_public;
    amount_public === amount_public;
}

component main = PrivacyPoolDemo(32);
