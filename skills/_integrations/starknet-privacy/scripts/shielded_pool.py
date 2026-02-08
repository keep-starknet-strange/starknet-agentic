#!/usr/bin/env python3.12
"""
Shielded Pool - Privacy pool for confidential transactions on Starknet

Similar to Zcash shielded pool, but using note-based architecture.
"""

import hashlib
import json
import secrets
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict
from cryptography.fernet import Fernet
from pathlib import Path

from notes import ConfidentialNote, NoteMerkleTree, MerkleProof

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('shielded-pool')


@dataclass
class ShieldedPoolError(Exception):
    """Base exception for shielded pool errors."""
    message: str
    code: str = "POOL_ERROR"

    def __str__(self):
        return f"[{self.code}] {self.message}"


@dataclass
class InsufficientBalanceError(ShieldedPoolError):
    """Raised when note has insufficient balance for operation."""
    available: int
    required: int

    def __init__(self, available: int, required: int):
        super().__init__(
            message=f"Insufficient balance: {available} < {required}",
            code="INSUFFICIENT_BALANCE"
        )
        self.available = available
        self.required = required


@dataclass
class NoteNotFoundError(ShieldedPoolError):
    """Raised when note commitment is not found in pool."""
    commitment: str

    def __init__(self, commitment: str):
        super().__init__(
            message=f"Note not found: {commitment}",
            code="NOTE_NOT_FOUND"
        )
        self.commitment = commitment


@dataclass
class NoteAlreadySpentError(ShieldedPoolError):
    """Raised when trying to spend a note that was already spent."""
    nullifier: int

    def __init__(self, nullifier: int):
        super().__init__(
            message=f"Note already spent (nullifier: {hex(nullifier)})",
            code="NOTE_SPENT"
        )
        self.nullifier = nullifier


@dataclass
class InvalidSecretError(ShieldedPoolError):
    """Raised when secret doesn't match note ownership."""
    commitment: str

    def __init__(self, commitment: str):
        super().__init__(
            message=f"Invalid secret for note: {commitment}",
            code="INVALID_SECRET"
        )
        self.commitment = commitment


@dataclass
class ShieldedPool:
    """
    Shielded pool for private deposits, transfers, and withdrawals.
    
    Architecture:
    1. User deposits ETH → receives encrypted note
    2. User spends note → creates new note for recipient
    3. User withdraws → burns note, gets ETH
    """
    
    name: str = "starknet-shielded-pool"
    merkle_depth: int = 16  # Reduced from 32 for demo
    notes: Dict[str, ConfidentialNote] = field(default_factory=dict)
    nullifiers: set = field(default_factory=set)
    merkle_tree: NoteMerkleTree = field(default_factory=lambda: NoteMerkleTree(32))
    
    def __init__(self, name: str = "starknet-shielded-pool"):
        self.name = name
        self.merkle_tree = NoteMerkleTree(self.merkle_depth)
        self.notes = {}
        self.nullifiers = set()
    
    def deposit(self, amount: int, owner_secret: int) -> Dict:
        """
        Deposit funds into shielded pool and receive encrypted note.
        
        Args:
            amount: Amount in wei
            owner_secret: Secret key for note encryption
            
        Returns:
            Dict with note details and commitment
            
        Raises:
            ValueError: If amount is not positive
        """
        try:
            if amount <= 0:
                raise ValueError("Amount must be positive")
            
            # Create confidential note
            note = ConfidentialNote.create(amount, owner_secret)
            
            # Insert into merkle tree
            index = self.merkle_tree.insert(note.commitment)
            
            # Store note
            self.notes[hex(note.commitment)] = note
            
            logger.info(f"Deposited {amount} wei, commitment: {hex(note.commitment)[:20]}...")
            
            return {
                'status': 'success',
                'action': 'deposit',
                'amount': amount,
                'note': note.to_dict(),
                'commitment': hex(note.commitment),
                'nullifier': hex(note.nullifier),
                'merkle_index': index,
                'merkle_root': hex(self.merkle_tree.get_root()),
                'message': f'Deposited {amount} wei. Save your note commitment: {hex(note.commitment)}'
            }
        except ValueError as e:
            logger.error(f"Deposit failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during deposit: {e}")
            raise ShieldedPoolError(f"Deposit failed: {e}") from e
    
    def create_transfer(
        self,
        from_commitment: str,
        to_address: str,
        amount: int,
        owner_secret: int
    ) -> Dict:
        """
        Create a private transfer (spend note, create new note).
        
        Args:
            from_commitment: Commitment of note to spend
            to_address: Recipient Starknet address
            amount: Amount to transfer
            owner_secret: Secret key for decryption
            
        Returns:
            Dict with new note and transfer proof data
            
        Raises:
            NoteNotFoundError: If note commitment not found
            InsufficientBalanceError: If note value < amount
            NoteAlreadySpentError: If nullifier already published
        """
        try:
            from_commitment = from_commitment.lower().replace('0x', '')
            note_key = f"0x{from_commitment}"
            
            # Get and verify note
            if note_key not in self.notes:
                raise NoteNotFoundError(from_commitment)
            
            note = self.notes[note_key]
            
            if note.value < amount:
                raise InsufficientBalanceError(note.value, amount)
            
            # Check if note already spent
            if note.nullifier in self.nullifiers:
                raise NoteAlreadySpentError(note.nullifier)
            
            # Generate merkle proof
            try:
                index = self.merkle_tree.leaves.index(note.commitment)
                proof = self.merkle_tree.get_proof(index)
            except (ValueError, IndexError) as e:
                raise ShieldedPoolError(f"Failed to generate merkle proof: {e}") from e
            
            # Publish nullifier (marks note as spent)
            self.nullifiers.add(note.nullifier)
            logger.info(f"Published nullifier: {hex(note.nullifier)[:20]}...")
            
            # Create change note (if any)
            change_amount = note.value - amount
            change_note = None
            if change_amount > 0:
                change_note = ConfidentialNote.create(change_amount, owner_secret)
                change_index = self.merkle_tree.insert(change_note.commitment)
                self.notes[hex(change_note.commitment)] = change_note
            
            # Create new note for recipient
            # In real implementation, recipient would provide their secret
            recipient_secret = int(hashlib.sha256(to_address.encode()).hexdigest(), 16) % (2**256)
            new_note = ConfidentialNote.create(amount, recipient_secret)
            new_index = self.merkle_tree.insert(new_note.commitment)
            self.notes[hex(new_note.commitment)] = new_note
            
            logger.info(f"Transferred {amount} wei to {to_address[:20]}...")
            
            return {
                'status': 'success',
                'action': 'transfer',
                'from_note': note.to_dict(),
                'to_note': new_note.to_dict(),
                'change_note': change_note.to_dict() if change_note else None,
                'amount_transferred': amount,
                'change_amount': change_amount if change_amount > 0 else 0,
                'nullifier_published': hex(note.nullifier),
                'merkle_proof': {
                    'leaf_index': proof.leaf_index,
                    'root': hex(proof.root),
                    'path': [hex(p) for p in proof.path]
                },
                'new_merkle_root': hex(self.merkle_tree.get_root()),
                'message': f'Transferred {amount} wei privately'
            }
        except (NoteNotFoundError, InsufficientBalanceError, NoteAlreadySpentError):
            raise
        except Exception as e:
            logger.error(f"Unexpected error during transfer: {e}")
            raise ShieldedPoolError(f"Transfer failed: {e}") from e
    
    def withdraw(
        self,
        commitment: str,
        owner_secret: int,
        recipient_address: str
    ) -> Dict:
        """
        Withdraw funds from shielded pool.
        
        Args:
            commitment: Note commitment to spend
            owner_secret: Secret key for note
            recipient_address: Where to send ETH
            
        Returns:
            Dict with withdrawal details
            
        Raises:
            NoteNotFoundError: If commitment not found
            NoteAlreadySpentError: If nullifier already published
            InvalidSecretError: If secret doesn't match note ownership
        """
        try:
            commitment = commitment.lower().replace('0x', '')
            note_key = f"0x{commitment}"
            
            if note_key not in self.notes:
                raise NoteNotFoundError(commitment)
            
            note = self.notes[note_key]
            
            if note.nullifier in self.nullifiers:
                raise NoteAlreadySpentError(note.nullifier)
            
            # Verify note belongs to owner
            if note.secret != owner_secret:
                raise InvalidSecretError(commitment)
            
            # Generate merkle proof
            try:
                index = self.merkle_tree.leaves.index(note.commitment)
                proof = self.merkle_tree.get_proof(index)
            except (ValueError, IndexError) as e:
                raise ShieldedPoolError(f"Failed to generate merkle proof: {e}") from e
            
            # Publish nullifier
            self.nullifiers.add(note.nullifier)
            logger.info(f"Published withdrawal nullifier: {hex(note.nullifier)[:20]}...")
            
            # Remove note
            del self.notes[note_key]
            
            logger.info(f"Withdrew {note.value} wei to {recipient_address[:20]}...")
            
            return {
                'status': 'success',
                'action': 'withdraw',
                'amount': note.value,
                'recipient': recipient_address,
                'nullifier_published': hex(note.nullifier),
                'merkle_proof': {
                    'leaf_index': proof.leaf_index,
                    'root': hex(proof.root),
                    'path': [hex(p) for p in proof.path]
                },
                'message': f'Withdrew {note.value} wei to {recipient_address}'
            }
        except (NoteNotFoundError, NoteAlreadySpentError, InvalidSecretError):
            raise
        except Exception as e:
            logger.error(f"Unexpected error during withdrawal: {e}")
            raise ShieldedPoolError(f"Withdrawal failed: {e}") from e
    
    def get_balance(self, secret: int) -> Dict:
        """
        Get total balance for notes owned by secret.
        
        Args:
            secret: Owner's secret key
            
        Returns:
            Dict with balance and notes
        """
        total = 0
        owned_notes = []
        
        for commitment_hex, note in self.notes.items():
            if note.secret == secret:
                total += note.value
                owned_notes.append(note.to_dict())
        
        return {
            'total_balance': total,
            'note_count': len(owned_notes),
            'notes': owned_notes
        }
    
    def verify_integrity(self) -> Dict:
        """Verify shielded pool integrity."""
        issues = []
        
        # Check all notes have valid commitments
        for commitment_hex, note in self.notes.items():
            if note.commitment != int(commitment_hex, 16):
                issues.append(f"Commitment mismatch for note {commitment_hex}")
        
        # Check merkle tree consistency
        expected_root = self.merkle_tree.get_root()
        
        # Check nullifiers are unique
        if len(self.nullifiers) != len(set(self.nullifiers)):
            issues.append("Duplicate nullifiers found")
        
        return {
            'valid': len(issues) == 0,
            'total_notes': len(self.notes),
            'spent_nullifiers': len(self.nullifiers),
            'merkle_root': hex(expected_root),
            'issues': issues
        }
    
    def export_state(self) -> Dict:
        """Export pool state for persistence."""
        return {
            'name': self.name,
            'notes': {k: v.to_dict() for k, v in self.notes.items()},
            'nullifiers': [hex(n) for n in self.nullifiers],
            'merkle_root': hex(self.merkle_tree.get_root())
        }
    
    @classmethod
    def import_state(cls, state: Dict) -> 'ShieldedPool':
        """Import pool state from saved data."""
        pool = cls(name=state.get('name', 'starknet-shielded-pool'))
        
        for commitment_hex, note_data in state.get('notes', {}).items():
            note = ConfidentialNote.from_dict(note_data)
            pool.notes[commitment_hex] = note
            # Rebuild merkle tree
            pool.merkle_tree.insert(note.commitment)
        
        for nullifier_hex in state.get('nullifiers', []):
            pool.nullifiers.add(int(nullifier_hex, 16))
        
        return pool


def demo():
    """Run a demo of shielded pool operations."""
    print("=" * 60)
    print("Starknet Shielded Pool Demo")
    print("=" * 60)
    
    # Create pool
    pool = ShieldedPool()
    
    # Alice's secret (random)
    alice_secret = secrets.randbits(256)
    print(f"\n1. Alice's secret: {hex(alice_secret)[:20]}...")
    
    # Alice deposits 100 ETH
    deposit_result = pool.deposit(100_000_000_000_000_000, alice_secret)  # 100 ETH in wei
    print(f"\n2. Alice deposits 100 ETH")
    print(f"   Note commitment: {deposit_result['commitment'][:20]}...")
    print(f"   Merkle root: {deposit_result['merkle_root'][:20]}...")
    
    # Check balance
    balance = pool.get_balance(alice_secret)
    print(f"\n3. Alice's balance: {balance['total_balance'] / 1e18:.4f} ETH")
    
    # Alice transfers 50 ETH to Bob
    print(f"\n4. Alice transfers 50 ETH to Bob (0x1234...)")
    bob_address = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd"
    transfer_result = pool.create_transfer(
        deposit_result['commitment'],
        bob_address,
        50_000_000_000_000_000,  # 50 ETH
        alice_secret
    )
    print(f"   New merkle root: {transfer_result['new_merkle_root'][:20]}...")
    
    # Check balances
    alice_balance = pool.get_balance(alice_secret)
    print(f"\n5. Alice's new balance: {alice_balance['total_balance'] / 1e18:.4f} ETH")
    
    # Verify integrity
    integrity = pool.verify_integrity()
    print(f"\n6. Pool integrity: {'VALID' if integrity['valid'] else 'ISSUES'}")
    print(f"   Total notes: {integrity['total_notes']}")
    print(f"   Spent nullifiers: {integrity['spent_nullifiers']}")
    
    print("\n" + "=" * 60)
    print("Demo complete! In real implementation:")
    print("- ZK-SNARK proofs would be generated using Garaga")
    print("- Contracts would be deployed on Starknet")
    print("- Transactions would be on-chain")
    print("=" * 60)


if __name__ == "__main__":
    import secrets
    demo()
