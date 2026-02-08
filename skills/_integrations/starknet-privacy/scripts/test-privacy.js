#!/usr/bin/env node
/**
 * Test suite for Starknet Privacy Pool Node.js integration
 */

const { StarknetPrivacyPool } = require('./starknet-privacy');

async function runTests() {
    console.log('='.repeat(50));
    console.log('🧪 Starknet Privacy Pool - Test Suite');
    console.log('='.repeat(50));
    
    const pool = new StarknetPrivacyPool(8); // Smaller tree for tests
    let passed = 0;
    let failed = 0;
    
    // Test helper
    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (err) {
            console.log(`❌ ${name}`);
            console.log(`   Error: ${err.message}`);
            failed++;
        }
    };
    
    // ========== Commitment Tests ==========
    console.log('\n📝 Commitment Tests\n');
    
    await test('Generate commitment returns BigInt', async () => {
        const c = await pool.generateCommitment(1000, 12345);
        if (typeof c !== 'bigint') throw new Error('Expected BigInt');
        if (c <= 0n) throw new Error('Expected positive value');
    });
    
    await test('Same inputs produce same commitment', async () => {
        const c1 = await pool.generateCommitment(1000, 12345);
        const c2 = await pool.generateCommitment(1000, 12345);
        if (c1 !== c2) throw new Error('Commitments should be equal');
    });
    
    await test('Different salts produce different commitments', async () => {
        const c1 = await pool.generateCommitment(1000, 12345);
        const c2 = await pool.generateCommitment(1000, 54321);
        if (c1 === c2) throw new Error('Commitments should differ');
    });
    
    await test('Different amounts produce different commitments', async () => {
        const c1 = await pool.generateCommitment(1000, 12345);
        const c2 = await pool.generateCommitment(2000, 12345);
        if (c1 === c2) throw new Error('Commitments should differ');
    });
    
    await test('Generate nullifier returns BigInt', async () => {
        const n = await pool.generateNullifier(12345, 67890);
        if (typeof n !== 'bigint') throw new Error('Expected BigInt');
    });
    
    // ========== Merkle Tree Tests ==========
    console.log('\n🌳 Merkle Tree Tests\n');
    
    await test('Empty tree returns root 0', async () => {
        const { root } = await pool.buildMerkleTree([]);
        if (root !== 0n) throw new Error('Empty tree root should be 0');
    });
    
    await test('Single element tree', async () => {
        const { root } = await pool.buildMerkleTree([100n]);
        if (root <= 0n) throw new Error('Expected positive root');
    });
    
    await test('Multiple elements tree', async () => {
        const commitments = [100n, 200n, 300n, 400n];
        const { root } = await pool.buildMerkleTree(commitments);
        if (root <= 0n) throw new Error('Expected positive root');
    });
    
    await test('Merkle proof returns valid structure', async () => {
        const commitments = [100n, 200n, 300n, 400n];
        const { proof, indices } = await pool.getMerkleProof(commitments, 0);
        if (!Array.isArray(proof)) throw new Error('Proof should be array');
        if (!Array.isArray(indices)) throw new Error('Indices should be array');
        if (proof.length !== 8) throw new Error('Expected 8 path elements for 8-level tree');
    });
    
    await test('Merkle proof for index out of range returns padding', async () => {
        const commitments = [100n];
        // Should not throw, should return padding
        const { proof, indices } = await pool.getMerkleProof(commitments, 10);
        // Returns padding values instead of throwing
        if (proof.length !== 8) throw new Error('Expected 8 path elements');
    });
    
    // ========== ZK Proof Tests ==========
    console.log('\n🧾 ZK Proof Tests\n');
    
    await test('Generate proof returns valid structure', async () => {
        const commitments = [100n, 200n, 300n, 400n];
        const { root } = await pool.buildMerkleTree(commitments);
        
        const result = await pool.generateProof(
            500,           // amount
            12345n,        // salt
            67890n,        // secret
            commitments,   // all commitments
            2,             // leaf index
            root           // merkle root
        );
        
        if (!result.proof) throw new Error('Missing proof');
        if (!result.public) throw new Error('Missing public inputs');
        if (!result.nullifier) throw new Error('Missing nullifier');
        if (!result.commitment) throw new Error('Missing commitment');
    });
    
    await test('Proof has correct Groth16 structure', async () => {
        const commitments = [100n, 200n];
        const { root } = await pool.buildMerkleTree(commitments);
        
        const result = await pool.generateProof(500, 12345n, 67890n, commitments, 0, root);
        const { proof } = result;
        
        if (proof.protocol !== 'groth16') throw new Error('Wrong protocol');
        if (proof.curve !== 'bn128') throw new Error('Wrong curve');
        if (!proof.pi_a || proof.pi_a.length !== 3) throw new Error('Invalid pi_a');
        if (!proof.pi_b || proof.pi_b.length !== 3) throw new Error('Invalid pi_b');
        if (!proof.pi_c || proof.pi_c.length !== 3) throw new Error('Invalid pi_c');
    });
    
    await test('Public inputs contain nullifier and root', async () => {
        const commitments = [100n, 200n];
        const { root } = await pool.buildMerkleTree(commitments);
        
        const result = await pool.generateProof(500, 12345n, 67890n, commitments, 0, root);
        
        if (result.public.length !== 2) throw new Error('Expected 2 public inputs');
    });
    
    await test('Verify proof returns boolean', async () => {
        const commitments = [100n, 200n];
        const { root } = await pool.buildMerkleTree(commitments);
        
        const result = await pool.generateProof(500, 12345n, 67890n, commitments, 0, root);
        const isValid = await pool.verifyProof(result.proof, result.public);
        
        if (typeof isValid !== 'boolean') throw new Error('verifyProof should return boolean');
    });
    
    // ========== Integration Tests ==========
    console.log('\n🔗 Integration Tests\n');
    
    await test('Full deposit -> spend workflow', async () => {
        // 1. Create commitments
        const commitments = [
            await pool.generateCommitment(100, 1n),
            await pool.generateCommitment(200, 2n),
            await pool.generateCommitment(300, 3n),
            await pool.generateCommitment(400, 4n)
        ];
        
        // 2. Build tree
        const { root } = await pool.buildMerkleTree(commitments);
        
        // 3. Generate proof for spending commitment at index 2
        const result = await pool.generateProof(
            300, 3n, 999n, // amount, salt, secret
            commitments, 2, root
        );
        
        // 4. Verify
        const isValid = await pool.verifyProof(result.proof, result.public);
        if (!isValid) throw new Error('Proof should be valid');
    });
    
    // ========== Status Check ==========
    console.log('\n📋 Status Check\n');
    
    const status = await pool.getStatus();
    console.log(`   SnarkJS installed: ${status.snarkjsInstalled ? '✅' : '❌'}`);
    console.log(`   Circom installed: ${status.circomInstalled ? '✅' : '❌'}`);
    console.log(`   Circuit compiled: ${status.circuitCompiled ? '✅' : '⚠️'}`);
    console.log(`   VK exists: ${status.verificationKeyExists ? '✅' : '⚠️'}`);
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50));
    
    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
