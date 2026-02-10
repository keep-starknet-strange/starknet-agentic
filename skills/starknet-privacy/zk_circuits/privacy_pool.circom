
include "./circomlib/circuits/poseidon.circom";

template PrivacyPool() {
    signal input nullifierPublic;
    signal input merkleRootPublic;
    signal input amountPublic;
    
    signal input salt;
    signal input nullifierSecret;
    signal input merklePath[4];
    signal input merkleIndices[4];
    
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== amountPublic;
    commitmentHasher.inputs[1] <== salt;
    signal commitment <== commitmentHasher.out;
    
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== commitment;
    nullifierHasher.inputs[1] <== nullifierSecret;
    signal nullifier <== nullifierHasher.out;
    
    nullifier === nullifierPublic;
    
    signal cur;
    cur <== commitment;
    
    component merkleHashers[4];
    for (var i = 0; i < 4; i++) {
        merkleHashers[i] = Poseidon(2);
        if (merkleIndices[i] == 0) {
            merkleHashers[i].inputs[0] <== cur;
            merkleHashers[i].inputs[1] <== merklePath[i];
        } else {
            merkleHashers[i].inputs[0] <== merklePath[i];
            merkleHashers[i].inputs[1] <== cur;
        }
        cur <== merkleHashers[i].out;
    }
    
    cur === merkleRootPublic;
}

component main = PrivacyPool();
