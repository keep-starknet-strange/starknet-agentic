#!/usr/bin/env python3
"""
Compute class hash from Sierra v1 contract artifact.

This module provides utilities for computing class hashes for Starknet contracts.
Used during deployment and verification of shielded pool contracts.
"""

import json
import logging
import sys
from typing import List, Dict, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('class-hash')


class ClassHashError(Exception):
    """Base exception for class hash computation errors."""
    pass


class FileNotFoundError(ClassHashError):
    """Raised when Sierra artifact file is not found."""
    pass


class InvalidSierraError(ClassHashError):
    """Raised when Sierra file has invalid format."""
    pass


def felt_to_bytes(felt: int) -> bytes:
    """Convert felt252 to 32-byte representation."""
    return felt.to_bytes(32, 'big')


def compute_class_hash(sierra_path: str) -> Optional[str]:
    """
    Compute class hash from Sierra v1 artifact.

    The class hash is computed as:
    hash = pedersen(
        version,
        pedersen(sierra_program_hash, entry_points_hash),
        contract_class_version,
        hints_hash
    )

    Args:
        sierra_path: Path to .sierra.json artifact file

    Returns:
        Class hash string or None if computation requires external tooling

    Raises:
        FileNotFoundError: If Sierra file doesn't exist
        InvalidSierraError: If Sierra file has invalid format
    """
    try:
        with open(sierra_path, 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        raise FileNotFoundError(f"Sierra artifact not found: {sierra_path}")
    except json.JSONDecodeError as e:
        raise InvalidSierraError(f"Invalid JSON in Sierra file: {e}")

    try:
        # Extract entry points
        funcs = data.get('funcs', [])
        external = []
        l1_handler = []
        constructor = []

        for func in funcs:
            entry_point = func.get('entry_point')
            debug_name = func.get('debug_name', '')

            if debug_name and 'constructor' in debug_name.lower():
                constructor.append(entry_point)
            elif debug_name and 'l1_handler' in debug_name.lower():
                l1_handler.append(entry_point)
            elif entry_point is not None and entry_point > 0:
                external.append(entry_point)

        # Sort entry points
        external.sort()
        l1_handler.sort()
        constructor.sort()

        # Version
        version = data.get('version', 1)

        # Contract class version
        contract_class_version = data.get('contract_class_version', '0.0.0')

        logger.info(f"Version: {version}")
        logger.info(f"Contract class version: {contract_class_version}")
        logger.info(f"External entry points: {len(external)}")
        logger.info(f"L1 handler entry points: {len(l1_handler)}")
        logger.info(f"Constructor entry points: {len(constructor)}")

        print(f"\nExternal selectors: {[hex(ep) for ep in external]}")
        print(f"Constructor selectors: {[hex(ep) for ep in constructor]}")

        # Simplified class hash (real implementation needs starknet_py or Cairo)
        # For now, return a placeholder that user can use with wallet UI
        print("\n" + "="*60)
        print("NOTE: Full class hash requires starknet-rs or Cairo tooling.")
        print("Use wallet UI to deploy directly from .sierra.json file.")
        print("="*60)

        return None

    except Exception as e:
        logger.error(f"Error computing class hash: {e}")
        raise ClassHashError(f"Failed to compute class hash: {e}") from e


if __name__ == "__main__":
    try:
        sierra_path = sys.argv[1] if len(sys.argv) > 1 else "target/dev/contract.sierra.json"
        result = compute_class_hash(sierra_path)
        if result:
            print(f"Class hash: {result}")
    except ClassHashError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
