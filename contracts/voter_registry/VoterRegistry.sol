// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { IVoterRegistry } from "./IVoterRegistry.sol";
import { IRoleBasedAccess } from "../access/IRoleBasedAccess.sol";
import { IAuditTrail } from "../audit/IAuditTrail.sol";

/// @title VoterRegistry
/// @notice Stores merkle roots for voter lists (eligibility) and uses bitmap to ensure 1 vote per voter per election.
contract VoterRegistry is IVoterRegistry {
    /// address of the RBAC proxy (for roles)
    address public immutable rbacProxy;

    /// address of the AuditTrail contract (for logging)
    address public immutable auditTrail;

    /// mapping from election id to the saved merkle root
    mapping(uint256 => bytes32) private snapshots;

    /// mapping for voted bitmap: electionId => wordIndex => 256-bit word
    mapping(uint256 => mapping(uint256 => uint256)) private votedBitmap;

    /// set the addresses for RBAC and AuditTrail
    constructor(address _rbacProxy, address _auditTrail) {
        require(_rbacProxy != address(0), "rbac zero");
        require(_auditTrail != address(0), "audit zero");
        rbacProxy = _rbacProxy;
        auditTrail = _auditTrail;
    }

    /// save a new merkle root for an election
    /// only admin or registrar can call this
    function snapshot(uint256 electionId, bytes32 merkleRoot) external override {
        require(_hasRegistrarOrAdmin(msg.sender), "Not authorized");
        require(snapshots[electionId] == bytes32(0), "Already snapshotted");

        snapshots[electionId] = merkleRoot;

        emit SnapshotTaken(electionId, merkleRoot, block.timestamp);
        IAuditTrail(auditTrail).logAction(bytes32("SNAPSHOT"), bytes32(electionId));
    }

    /// get the root for an election
    function getSnapshot(uint256 electionId) external view override returns (bytes32) {
        return snapshots[electionId];
    }

    /// check if a leaf belongs to the root saved for electionId
    function verifyProof(
        uint256 electionId,
        bytes32 leaf,
        bytes32[] calldata proof
    ) public view override returns (bool) {
        bytes32 root = snapshots[electionId];
        require(root != bytes32(0), "No snapshot");

        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        return computedHash == root;
    }

    /// Cast a vote: checks eligibility and uniqueness
    /// @param electionId the election id
    /// @param index the voter's index inside the Merkle tree
    /// @param voterHash the hashed voter code
    /// @param proof the Merkle proof showing (index, voterHash) is part of the root
    function vote(
        uint256 electionId,
        uint256 index,
        bytes32 voterHash,
        bytes32[] calldata proof
    ) external override {
        // 1. Verify eligibility
        bytes32 leaf = keccak256(abi.encodePacked(index, voterHash));
        require(verifyProof(electionId, leaf, proof), "Not eligible");

        // 2. Check bitmap for uniqueness
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        uint256 word = votedBitmap[electionId][wordIndex];
        uint256 mask = (1 << bitIndex);

        require(word & mask == 0, "Already voted");

        // 3. Mark as voted
        votedBitmap[electionId][wordIndex] = word | mask;

        emit Voted(electionId, index, voterHash);
        IAuditTrail(auditTrail).logAction(bytes32("VOTE_CAST"), bytes32(electionId));
    }

    /// just a helper to check if a voter index already voted or not
    /// @param electionId the election we want to check
    /// @param index the index of the voter
    function hasVoted(uint256 electionId, uint256 index) external view override returns (bool) {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        uint256 word = votedBitmap[electionId][wordIndex];
        return (word & (1 << bitIndex)) != 0;
    }

    /// internal helper to check roles
    function _hasRegistrarOrAdmin(address account) internal view returns (bool) {
        bool isRegistrar = IRoleBasedAccess(rbacProxy).hasRole(
            IRoleBasedAccess(rbacProxy).REGISTRAR_ROLE(),
            account
        );
        bool isAdmin = IRoleBasedAccess(rbacProxy).hasRole(
            IRoleBasedAccess(rbacProxy).DEFAULT_ADMIN_ROLE(),
            account
        );
        return isRegistrar || isAdmin;
    }
}
