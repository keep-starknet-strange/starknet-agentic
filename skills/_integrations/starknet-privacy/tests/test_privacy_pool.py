#!/usr/bin/env python3
"""
Unit tests for ZK Privacy Pool
"""

import pytest
import random
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from zk_snarkjs_workflow import ZKPrivacyPool


class TestCommitment:
    """Tests for commitment generation"""
    
    def setup_method(self):
        self.pool = ZKPrivacyPool(levels=32)
    
    def test_generate_commitment_basic(self):
        """Test basic commitment generation"""
        commitment = self.pool.generate_commitment(1000, 12345)
        assert commitment > 0
        assert isinstance(commitment, int)
    
    def test_generate_commitment_deterministic(self):
        """Test that same inputs produce same commitment"""
        c1 = self.pool.generate_commitment(1000, 12345)
        c2 = self.pool.generate_commitment(1000, 12345)
        assert c1 == c2
    
    def test_generate_commitment_different_salts(self):
        """Test different salts produce different commitments"""
        c1 = self.pool.generate_commitment(1000, 12345)
        c2 = self.pool.generate_commitment(1000, 54321)
        assert c1 != c2
    
    def test_generate_commitment_different_amounts(self):
        """Test different amounts produce different commitments"""
        c1 = self.pool.generate_commitment(1000, 12345)
        c2 = self.pool.generate_commitment(2000, 12345)
        assert c1 != c2
    
    def test_generate_nullifier_basic(self):
        """Test basic nullifier generation"""
        nullifier = self.pool.generate_nullifier(12345, 67890)
        assert nullifier > 0
        assert isinstance(nullifier, int)
    
    def test_nullifier_deterministic(self):
        """Test nullifier is deterministic"""
        n1 = self.pool.generate_nullifier(12345, 67890)
        n2 = self.pool.generate_nullifier(12345, 67890)
        assert n1 == n2


class TestMerkleTree:
    """Tests for Merkle tree operations"""
    
    def setup_method(self):
        self.pool = ZKPrivacyPool(levels=32)
    
    def test_empty_tree(self):
        """Test empty tree returns zero root"""
        root, _ = self.pool.build_merkle_tree([])
        assert root == 0
    
    def test_single_element(self):
        """Test single element tree"""
        commitments = [12345]
        root, _ = self.pool.build_merkle_tree(commitments)
        assert root > 0
    
    def test_pow2_elements(self):
        """Test tree with power of 2 elements"""
        commitments = [100, 200, 300, 400]
        root, _ = self.pool.build_merkle_tree(commitments)
        assert root > 0
    
    def test_non_pow2_elements(self):
        """Test tree with non-power of 2 elements"""
        commitments = [100, 200, 300]
        root, _ = self.pool.build_merkle_tree(commitments)
        assert root > 0
    
    def test_merkle_proof_valid_index(self):
        """Test Merkle proof for valid index"""
        commitments = [100, 200, 300, 400, 500, 600, 700, 800]
        root, _ = self.pool.build_merkle_tree(commitments)
        
        # Get proof for index 3
        path, indices = self.pool.get_merkle_proof(commitments, 3)
        
        assert len(path) == 32  # 32 levels
        assert len(indices) == 32
    
    def test_merkle_proof_invalid_index(self):
        """Test Merkle proof raises error for invalid index"""
        commitments = [100, 200]
        
        with pytest.raises(ValueError):
            self.pool.get_merkle_proof(commitments, 10)


class TestZKProof:
    """Tests for ZK proof generation"""
    
    def setup_method(self):
        self.pool = ZKPrivacyPool(levels=32)
    
    def test_generate_proof_structure(self):
        """Test proof has correct structure"""
        commitments = [100, 200, 300, 400]
        root, _ = self.pool.build_merkle_tree(commitments)
        
        result = self.pool.generate_proof(
            amount=500,
            salt=12345,
            secret=67890,
            commitments=commitments,
            leaf_index=2,
            merkle_root=root
        )
        
        assert "proof" in result
        assert "public" in result
        assert "nullifier" in result
        assert "commitment" in result
        
        # Check proof structure
        proof = result["proof"]
        assert "pi_a" in proof
        assert "pi_b" in proof
        assert "pi_c" in proof
        assert proof["protocol"] == "groth16"
    
    def test_generate_proof_public_inputs(self):
        """Test public inputs contain nullifier and root"""
        commitments = [100, 200, 300, 400]
        root, _ = self.pool.build_merkle_tree(commitments)
        
        result = self.pool.generate_proof(
            amount=500,
            salt=12345,
            secret=67890,
            commitments=commitments,
            leaf_index=2,
            merkle_root=root
        )
        
        # Public should contain nullifier and merkle_root
        assert len(result["public"]) == 2
    
    def test_verify_proof_returns_bool(self):
        """Test verification returns boolean"""
        commitments = [100, 200, 300, 400]
        root, _ = self.pool.build_merkle_tree(commitments)
        
        result = self.pool.generate_proof(
            amount=500,
            salt=12345,
            secret=67890,
            commitments=commitments,
            leaf_index=2,
            merkle_root=root
        )
        
        is_valid = self.pool.verify_proof(result["proof"], result["public"])
        assert isinstance(is_valid, bool)


class TestIntegration:
    """Integration tests"""
    
    def setup_method(self):
        self.pool = ZKPrivacyPool(levels=8)  # Smaller tree for faster tests
    
    def test_full_workflow(self):
        """Test complete privacy pool workflow"""
        # 1. Create commitments
        commitments = [self.pool.generate_commitment(amount * 100, i * 1000) 
                      for i, amount in enumerate(range(1, 9))]
        
        # 2. Build tree
        root, _ = self.pool.build_merkle_tree(commitments)
        
        # 3. Generate proof for a note
        result = self.pool.generate_proof(
            amount=500,
            salt=12345,
            secret=67890,
            commitments=commitments,
            leaf_index=3,
            merkle_root=root
        )
        
        # 4. Verify
        is_valid = self.pool.verify_proof(result["proof"], result["public"])
        assert is_valid
    
    def test_multiple_notes_same_pool(self):
        """Test creating notes in same pool"""
        commitments = []
        notes = []
        
        for i in range(4):
            amount = (i + 1) * 100
            salt = random.randint(1, 2**128)
            commitment = self.pool.generate_commitment(amount, salt)
            commitments.append(commitment)
            notes.append({"amount": amount, "salt": salt, "commitment": commitment})
        
        root, _ = self.pool.build_merkle_tree(commitments)
        
        # Create proof for each note
        for i, note in enumerate(notes):
            result = self.pool.generate_proof(
                amount=note["amount"],
                salt=note["salt"],
                secret=random.randint(1, 2**128),
                commitments=commitments,
                leaf_index=i,
                merkle_root=root
            )
            assert self.pool.verify_proof(result["proof"], result["public"])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
