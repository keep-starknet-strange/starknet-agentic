#!/usr/bin/env python3.12
"""
Confidential Note - Encrypted UTXO-style note for private transfers on Starknet.

This module provides the ConfidentialNote class for creating and managing
encrypted notes in the Starknet shielded pool. Notes are similar to Zcash
UTXOs but adapted for Starknet's architecture using Pedersen commitments.

Features:
- Value commitments using Pedersen hash
- Nullifier computation for double-spend prevention
- Merkle tree integration for membership proofs
- Encryption key derivation

Example:
    >>> from notes import ConfidentialNote
    >>> note = ConfidentialNote.create(value=1000, secret=0x123...)
    >>> print(hex(note.commitment))
"""

import hashlib
import secrets
from dataclasses import dataclass
from typing import Optional, List
from dataclasses import field


@dataclass
class ConfidentialNote:
    """
    Represents an encrypted note in the shielded pool.
    Similar to Zcash UTXO but on Starknet.
    """
    value: int
    secret: int  # Secret key for encryption (only owner knows)
    salt: int    # Random salt for uniqueness
    nullifier_salt: int  # For nullifier computation
    
    # Computed values
    commitment: Optional[int] = None
    nullifier: Optional[int] = None
    encryption_key: Optional[int] = None
    
    @classmethod
    def create(cls, value: int, secret: Optional[int] = None) -> 'ConfidentialNote':
        """Create a new confidential note."""
        secret = secret or secrets.randbits(256)
        salt = secrets.randbits(64)
        nullifier_salt = secrets.randbits(256)
        
        note = cls(
            value=value,
            secret=secret,
            salt=salt,
            nullifier_salt=nullifier_salt
        )
        
        # Compute derived values
        note._compute_commitment()
        note._compute_nullifier()
        note._compute_encryption_key()
        
        return note
    
    def _compute_commitment(self):
        """Compute note commitment (pedersen hash of note contents)."""
        # Using simple hash for demo - in production use Garaga's Pedersen
        data = f"{self.value}:{self.secret}:{self.salt}".encode()
        self.commitment = int(hashlib.sha256(data).hexdigest(), 16) % (2**251)
    
    def _compute_nullifier(self):
        """Compute nullifier (prevents double-spending)."""
        data = f"{self.commitment}:{self.nullifier_salt}".encode()
        self.nullifier = int(hashlib.sha256(data).hexdigest(), 16) % (2**251)
    
    def _compute_encryption_key(self):
        """Compute encryption key for note contents."""
        data = f"{self.secret}:{self.salt}".encode()
        self.encryption_key = int(hashlib.sha256(data).hexdigest(), 16) % (2**128)
    
    def encrypt(self) -> dict:
        """Encrypt note data for storage."""
        import json
        from cryptography.fernet import Fernet
        
        # Create Fernet key from encryption_key
        key_bytes = self.encryption_key.to_bytes(32, 'big')
        f = Fernet(key_bytes)
        
        data = {
            'value': self.value,
            'commitment': hex(self.commitment),
            'salt': hex(self.salt)
        }
        
        encrypted = f.encrypt(json.dumps(data).encode())
        
        return {
            'encrypted_data': encrypted.decode(),
            'nullifier': hex(self.nullifier)
        }
    
    @classmethod
    def decrypt(cls, encrypted_data: str, secret: int, salt: int) -> Optional['ConfidentialNote']:
        """Decrypt a note using owner's secret."""
        from cryptography.fernet import Fernet
        
        try:
            key_bytes = secret.to_bytes(32, 'big')
            f = Fernet(key_bytes)
            
            data = json.loads(f.decrypt(encrypted_data.encode()).decode())
            
            note = cls(
                value=data['value'],
                secret=secret,
                salt=salt,
                nullifier_salt=0  # Not stored in encrypted data
            )
            
            note.commitment = int(data['commitment'], 16)
            note._compute_nullifier()
            note._compute_encryption_key()
            
            return note
        except Exception as e:
            print(f"Decryption failed: {e}")
            return None
    
    def to_dict(self) -> dict:
        """Serialize note to dict."""
        return {
            'value': self.value,
            'secret': hex(self.secret),
            'salt': hex(self.salt),
            'nullifier_salt': hex(self.nullifier_salt),
            'commitment': hex(self.commitment) if self.commitment else None,
            'nullifier': hex(self.nullifier) if self.nullifier else None
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'ConfidentialNote':
        """Deserialize note from dict."""
        note = cls(
            value=data['value'],
            secret=int(data['secret'], 16),
            salt=int(data['salt'], 16),
            nullifier_salt=int(data['nullifier_salt'], 16)
        )
        if data.get('commitment'):
            note.commitment = int(data['commitment'], 16)
        if data.get('nullifier'):
            note.nullifier = int(data['nullifier'], 16)
        note._compute_encryption_key()
        return note


@dataclass
class MerkleProof:
    """Merkle proof for note membership."""
    leaf_index: int
    root: int
    path: List[int]  # Sibling nodes
    leaves: List[int]  # All leaves for verification


class NoteMerkleTree:
    """Merkle tree for storing note commitments."""
    
    def __init__(self, depth: int = 16):  # Reduced from 32 for demo
        self.depth = depth
        self.leaves: List[Optional[int]] = [None] * (2 ** depth)
        self.next_index = 0
        self._tree = [None] * (2 ** (depth + 1) - 1)
    
    def insert(self, commitment: int) -> int:
        """Insert a commitment and return its index."""
        if self.next_index >= len(self.leaves):
            raise ValueError("Merkle tree is full")
        
        index = self.next_index
        self.leaves[index] = commitment
        
        # Update tree
        pos = index + (2 ** self.depth) - 1
        self._tree[pos] = commitment
        
        # Compute parents
        for i in range(self.depth - 1, -1, -1):
            pos = (pos - 1) // 2
            left = self._tree[pos * 2 + 1]
            right = self._tree[pos * 2 + 2]
            
            if left is None and right is None:
                self._tree[pos] = None
            elif left is None:
                self._tree[pos] = right
            elif right is None:
                self._tree[pos] = left
            else:
                # Hash children (simplified - use Garaga in production)
                data = f"{left}:{right}".encode()
                self._tree[pos] = int(hashlib.sha256(data).hexdigest(), 16) % (2**251)
        
        self.next_index += 1
        return index
    
    def get_root(self) -> int:
        """Get current merkle root."""
        return self._tree[1] or 0
    
    def get_proof(self, index: int) -> MerkleProof:
        """Generate merkle proof for a leaf."""
        if index >= self.next_index:
            raise ValueError("Invalid index")
        
        depth = self.depth
        pos = index + (2 ** depth) - 1
        path = []
        
        for i in range(depth):
            sibling_pos = pos + 1 if pos % 2 == 0 else pos - 1
            sibling = self._tree[sibling_pos]
            path.append(sibling or 0)
            pos = (pos - 1) // 2
        
        return MerkleProof(
            leaf_index=index,
            root=self.get_root(),
            path=path,
            leaves=[l for l in self.leaves[:self.next_index] if l is not None]
        )
    
    def verify_proof(self, commitment: int, proof: MerkleProof) -> bool:
        """Verify a merkle proof."""
        # Recompute root from commitment and proof
        current = commitment
        
        for i, sibling in enumerate(proof.path):
            data = f"{current}:{sibling}".encode()
            current = int(hashlib.sha256(data).hexdigest(), 16) % (2**251)
        
        return current == proof.root


# Import for encryption
import json
from cryptography.fernet import Fernet
