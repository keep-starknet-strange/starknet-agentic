// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../ShieldedPool.sol";

contract ShieldedPoolTest is Test {
    ShieldedPool public pool;
    
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public charlie = address(0xCH4RL13);
    
    function setUp() public {
        pool = new ShieldedPool();
    }
    
    function testDeposit() public {
        vm.deal(alice, 100 ether);
        
        bytes32 commitment = keccak256(abi.encode(100 ether, alice, block.timestamp));
        
        vm.prank(alice);
        pool.deposit{value: 1 ether}(commitment);
        
        assertEq(address(pool).balance, 1 ether);
        assertEq(pool.poolBalance(), 1 ether);
    }
    
    function testTransfer() public {
        // Setup
        vm.deal(alice, 100 ether);
        bytes32 commitmentOld = keccak256(abi.encode(1 ether, alice, 1));
        
        vm.prank(alice);
        pool.deposit{value: 1 ether}(commitmentOld);
        
        // Prepare transfer
        bytes32 nullifier = keccak256(abi.encode(commitmentOld, 12345));
        bytes32 commitmentNew = keccak256(abi.encode(0.5 ether, bob, 2));
        
        // Update merkle root for test
        pool.updateMerkleRoot(keccak256(abi.encode(commitmentOld)));
        
        // Transfer
        bytes32[] memory proof = new bytes32[](0);
        
        vm.prank(alice);
        pool.transfer(
            nullifier,
            commitmentOld,
            commitmentNew,
            proof,
            abi.encode(bob, 0.5 ether)
        );
        
        assertTrue(pool.isNullifierUsed(nullifier));
    }
    
    function testWithdraw() public {
        // Setup
        vm.deal(address(pool), 10 ether);
        bytes32 commitment = keccak256(abi.encode(1 ether, alice, 1));
        bytes32 nullifier = keccak256(abi.encode(commitment, 12345));
        
        pool.updateMerkleRoot(keccak256(abi.encode(commitment)));
        
        // Withdraw
        bytes32[] memory proof = new bytes32[](0);
        
        vm.prank(alice);
        pool.withdraw(nullifier, commitment, proof, 1 ether, payable(alice));
        
        assertTrue(pool.isNullifierUsed(nullifier));
        assertEq(address(pool).balance, 9 ether);
    }
    
    function testDoubleSpendPrevented() public {
        bytes32 commitment = keccak256(abi.encode(1 ether, alice, 1));
        bytes32 nullifier = keccak256(abi.encode(commitment, 12345));
        
        // First spend
        pool.updateMerkleRoot(keccak256(abi.encode(commitment)));
        
        bytes32[] memory proof = new bytes32[](0);
        
        vm.prank(alice);
        pool.withdraw(nullifier, commitment, proof, 1 ether, payable(alice));
        
        // Second spend should fail
        vm.prank(alice);
        vm.expectRevert("Nullifier already used");
        pool.withdraw(nullifier, commitment, proof, 1 ether, payable(alice));
    }
    
    function testEmergencyWithdraw() public {
        vm.deal(address(pool), 10 ether);
        
        pool.emergencyWithdraw(5 ether);
        
        assertEq(address(pool).balance, 5 ether);
    }
}
