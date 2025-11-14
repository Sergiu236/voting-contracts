// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { ICandidateRegistry } from "./ICandidateRegistry.sol";
import { IRoleBasedAccess } from "../access/IRoleBasedAccess.sol";
import { IAuditTrail } from "../audit/IAuditTrail.sol";

/// @title CandidateRegistry
/// @notice Keeps candidates directly on-chain.
///         Each candidate has a party + one or more names.
///         For example: presidential = 1 name, parliamentary = list of names.
contract CandidateRegistry is ICandidateRegistry {
    address public immutable rbacProxy;
    address public immutable auditTrail;

    // counter for auto IDs
    uint256 private nextCandidateId;

    // candidateId => party
    mapping(uint256 => string) private candidateParty;

    // candidateId => list of names
    mapping(uint256 => string[]) private candidateNames;

    // all active candidate ids
    uint256[] private candidateIds;

    // electionId => candidate ids at snapshot
    mapping(uint256 => uint256[]) private snapshots;

    constructor(address _rbacProxy, address _auditTrail) {
        require(_rbacProxy != address(0), "rbac zero");
        require(_auditTrail != address(0), "audit zero");
        rbacProxy = _rbacProxy;
        auditTrail = _auditTrail;
    }

    /// add candidate, contract generates id
    function addCandidate(string calldata party, string[] calldata names) external override {
        require(_hasRegistrarOrAdmin(msg.sender), "Not authorized");
        require(names.length > 0, "Empty list");

        uint256 candidateId = ++nextCandidateId;

        candidateParty[candidateId] = party;
        for (uint256 i = 0; i < names.length; i++) {
            candidateNames[candidateId].push(names[i]);
        }
        candidateIds.push(candidateId);

        emit CandidateAdded(candidateId, party, names, msg.sender);
        IAuditTrail(auditTrail).logAction(bytes32("ADD_CANDIDATE"), bytes32(candidateId));
    }

    /// remove candidate by id
    function removeCandidate(uint256 candidateId) external override {
        require(_hasRegistrarOrAdmin(msg.sender), "Not authorized");
        require(bytes(candidateParty[candidateId]).length != 0, "Not found");

        delete candidateParty[candidateId];
        delete candidateNames[candidateId];

        for (uint256 i = 0; i < candidateIds.length; i++) {
            if (candidateIds[i] == candidateId) {
                candidateIds[i] = candidateIds[candidateIds.length - 1];
                candidateIds.pop();
                break;
            }
        }

        emit CandidateRemoved(candidateId, msg.sender);
        IAuditTrail(auditTrail).logAction(bytes32("REMOVE_CANDIDATE"), bytes32(candidateId));
    }

    function getParty(uint256 candidateId) external view override returns (string memory) {
        return candidateParty[candidateId];
    }

    function getCandidateNames(uint256 candidateId) external view override returns (string[] memory) {
        return candidateNames[candidateId];
    }

    function snapshot(uint256 electionId) external override {
        require(_hasRegistrarOrAdmin(msg.sender), "Not authorized");
        require(snapshots[electionId].length == 0, "Already snapshotted");

        snapshots[electionId] = candidateIds;

        emit CandidateSnapshot(electionId, block.timestamp);
        IAuditTrail(auditTrail).logAction(bytes32("SNAPSHOT_CAND"), bytes32(electionId));
    }

    function getCandidates(uint256 electionId) external view override returns (uint256[] memory) {
        return snapshots[electionId];
    }

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