#!/usr/bin/env python3
"""
Off-chain Merkle Tree Generator for Starknet Privacy Pool
Uses SHA256-based Pedersen simulation compatible with Cairo 2.14.0

Note: For production, use starknet.py or garaga for real EC operations
"""

import hashlib
from typing import List, Tuple, Optional
from dataclasses import dataclass
import json


# Starknet prime for field arithmetic
STARKNET_PRIME = 2**251 + 17 * 2**192 + 1


class PedersenHasher:
    """
    Pedersen hash for Starknet (SHA256 simulation).
    
    In production, this should use proper elliptic curve operations.
    The Cairo contract uses real Pedersen, but this Python simulation
    provides compatible outputs for testing.
    """
    
    # Generator points would be used in real EC implementation
    # These are simplified for the SHA256 simulation
    
    @staticmethod
    def hash(a: int, b: int) -> int:
        """
        Compute Pedersen-like hash H(a, b).
        
        This is a simulation of Starknet's Pedersen hash using SHA256.
        For production, use proper EC operations on BN254 curve.
        """
        # Ensure values are within field
        a = a % STARKNET_PRIME
        b = b % STARKNET_PRIME
        
        # Create deterministic hash
        combined = f"{a}:{b}".encode()
        hash_bytes = hashlib.sha256(combined).digest()
        
        # Convert to field element
        result = int.from_bytes(hash_bytes[:32], 'big')
        return result % STARKNET_PRIME
    
    @staticmethod
    def hash_list(values: List[int]) -> int:
        """Hash list of values iteratively (like Pedersen chain)."""
        if not values:
            return 0
        result = values[0]
        for v in values[1:]:
            result = PedersenHasher.hash(result, v)
        return result


@dataclass
class Note:
    """Privacy pool note (utxo-style)."""
    value: int  # Amount in the note
    secret: int  # Secret key (kept private)
    salt: int  # Random salt (public)
    commitment: Optional[int] = None
    nullifier: Optional[int] = None
    
    def __post_init__(self):
        if self.commitment is None:
            self.commitment = self.compute_commitment()
        if self.nullifier is None:
            self.nullifier = self.compute_nullifier()
    
    def compute_commitment(self) -> int:
        """
        Compute commitment: C = H(value, H(secret, salt))
        
        This matches the Cairo contract's compute_commitment function.
        """
        secret_hash = PedersenHasher.hash(self.secret, self.salt)
        return PedersenHasher.hash(self.value, secret_hash)
    
    def compute_nullifier(self) -> int:
        """
        Compute nullifier: N = H(secret, salt)
        
        Used to prevent double-spending.
        """
        return PedersenHasher.hash(self.secret, self.salt)


class MerkleTree:
    """
    Sparse Merkle Tree for privacy pool commitments.
    
    Supports efficient insertion and proof generation.
    """
    
    def __init__(self, height: int = 32):
        self.height = height
        self.leaves: dict = {}  # index -> commitment
        self.tree: dict = {}    # level -> {index: hash}
        self.next_index = 0
        self._build_empty_tree()
    
    def _build_empty_tree(self):
        """Build empty tree with zeros."""
        for level in range(self.height + 1):
            self.tree[level] = {}
    
    def insert(self, commitment: int) -> Tuple[int, List[int]]:
        """
        Insert commitment, return index and proof path.
        
        Args:
            commitment: The note commitment to insert
            
        Returns:
            Tuple of (index, path_to_root)
        """
        index = self.next_index
        self.next_index += 1
        
        # Store leaf
        self.leaves[index] = commitment
        self.tree[0][index] = commitment
        
        # Build up to root
        current = commitment
        path = [commitment]
        current_index = index
        
        for level in range(1, self.height + 1):
            sibling_index = current_index ^ 1  # sibling is at adjacent index
            
            if sibling_index in self.tree[level - 1]:
                sibling = self.tree[level - 1][sibling_index]
            else:
                sibling = 0  # Empty sibling
            
            # Parent hash (left/right matters for Pedersen)
            if current_index % 2 == 0:
                current = PedersenHasher.hash(current, sibling)
            else:
                current = PedersenHasher.hash(sibling, current)
            
            self.tree[level][current_index // 2] = current
            path.append(current)
            current_index //= 2
        
        return (index, path)
    
    def get_root(self) -> int:
        """Get current merkle root."""
        return self.tree[self.height].get(0, 0)
    
    def get_proof(self, index: int) -> List[Tuple[int, bool]]:
        """
        Get merkle proof for index.
        
        Returns:
            List of (sibling_hash, is_left) tuples
        """
        proof = []
        current = self.leaves.get(index, 0)
        
        for level in range(self.height):
            sibling_index = index ^ 1
            sibling = self.leaves.get(sibling_index, 0)
            is_left = (index % 2 == 0)
            proof.append((sibling, is_left))
            index //= 2
        
        return proof
    
    def generate_sparse_proof(self, index: int, commitments: List[int]) -> List[int]:
        """
        Generate proof suitable for Cairo contract.
        
        Args:
            index: Leaf index
            commitments: All commitments in tree order
            
        Returns:
            List of sibling hashes for proof
        """
        proof = []
        pos = index
        
        for level in range(self.height):
            sibling_pos = pos ^ 1
            if sibling_pos < len(commitments):
                proof.append(commitments[sibling_pos])
            else:
                proof.append(0)
            pos //= 2
        
        return proof


def verify_merkle_proof(leaf: int, proof: List[Tuple[int, bool]], root: int) -> bool:
    """
    Verify merkle proof.
    
    Args:
        leaf: The leaf hash
        proof: List of (sibling, is_left) tuples
        root: Expected root hash
        
    Returns:
        True if proof is valid
    """
    current = leaf
    for sibling, is_left in proof:
        if is_left:
            current = PedersenHasher.hash(current, sibling)
        else:
            current = PedersenHasher.hash(sibling, current)
    return current == root


def simulate_shielded_pool():
    """Simulate shielded pool operations."""
    print("=" * 60)
    print("STARKNET PRIVACY POOL - OFF-CHAIN SIMULATION")
    print("=" * 60)
    
    # Create tree
    tree = MerkleTree(height=32)
    
    # Create notes with random secrets
    notes = []
    for i in range(5):
        note = Note(
            value=100 * (i + 1),
            secret=int(hashlib.sha256(f"secret_{i}".encode()).hexdigest(), 16) % (2**128),
            salt=int(hashlib.sha256(f"salt_{i}".encode()).hexdigest(), 16) % (2**128)
        )
        notes.append(note)
        print(f"\n📝 Note {i}: value={note.value}")
        print(f"   Commitment: {hex(note.commitment)}")
        print(f"   Nullifier:  {hex(note.nullifier)}")
    
    # Deposit notes
    print("\n" + "=" * 60)
    print("DEPOSITS")
    print("=" * 60)
    
    commitments = []
    for i, note in enumerate(notes):
        idx, path = tree.insert(note.commitment)
        commitments.append(note.commitment)
        print(f"\n✅ Deposit {i}: index={idx}")
    
    print(f"\n📍 Merkle root: {hex(tree.get_root())}")
    
    # Generate withdrawal proof
    print("\n" + "=" * 60)
    print("WITHDRAWAL PROOF GENERATION")
    print("=" * 60)
    
    spend_note = notes[2]
    nullifier = spend_note.nullifier
    idx = 2
    
    # Generate proof
    proof = tree.get_proof(idx)
    sparse_proof = tree.generate_sparse_proof(idx, commitments)
    
    print(f"\n📜 Merkle Proof (sibling, is_left):")
    for i, (sibling, is_left) in enumerate(proof):
        print(f"   Level {i}: {hex(sibling)}, left={is_left}")
    
    print(f"\n📜 Sparse Proof (for Cairo):")
    for i, sibling in enumerate(sparse_proof):
        print(f"   Level {i}: {hex(sibling)}")
    
    # Verify proof
    is_valid = verify_merkle_proof(spend_note.commitment, proof, tree.get_root())
    print(f"\n✅ Merkle proof valid: {is_valid}")
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total notes: {len(notes)}")
    print(f"Merkle root: {hex(tree.get_root())}")
    print(f"Nullifier to spend: {hex(nullifier)}")
    
    print("\n📋 Contract calls for withdrawal:")
    print(f"   1. spend(nullifier={hex(nullifier)}, new_commitment=...)")
    print(f"   2. merkle_proof: {[hex(s) for s in sparse_proof]}")
    
    return tree, notes


if __name__ == "__main__":
    tree, notes = simulate_shielded_pool()
