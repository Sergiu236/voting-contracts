// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ICandidateRegistry } from "./ICandidateRegistry.sol";
import { IRoleBasedAccess } from "../access/IRoleBasedAccess.sol";
import { IAuditTrail } from "../audit/IAuditTrail.sol";

contract CandidateRegistry is ICandidateRegistry {
    address public immutable rbacProxy;
    address public immutable auditTrail;

    // electionId => next candidate id
    mapping(uint256 => uint256) private nextCandidateId;

    // electionId => candidateId => party
    mapping(uint256 => mapping(uint256 => string)) private candidateParty;

    // electionId => candidateId => names
    mapping(uint256 => mapping(uint256 => string[])) private candidateNames;

    // electionId => list of candidateIds
    mapping(uint256 => uint256[]) private electionCandidateIds;

    constructor(address _rbacProxy, address _auditTrail) {
        require(_rbacProxy != address(0), "rbac zero");
        require(_auditTrail != address(0), "audit zero");
        rbacProxy = _rbacProxy;
        auditTrail = _auditTrail;
    }

    function addCandidates(
        uint256 electionId,
        string[] calldata parties,
        string[][] calldata namesList
    ) external override {
        require(_hasRegistrarOrAdmin(msg.sender), "Not authorized");
        require(parties.length == namesList.length, "Length mismatch");
        require(parties.length > 0, "Empty input");

        for (uint256 i = 0; i < parties.length; i++) {
            require(namesList[i].length > 0, "Empty candidate names");

            uint256 candidateId = ++nextCandidateId[electionId];

            candidateParty[electionId][candidateId] = parties[i];

            for (uint256 j = 0; j < namesList[i].length; j++) {
                candidateNames[electionId][candidateId].push(namesList[i][j]);
            }

            electionCandidateIds[electionId].push(candidateId);

            emit CandidateAdded(electionId, candidateId, parties[i]);

            IAuditTrail(auditTrail).logAction(
                bytes32("ADD_CAND"),
                bytes32(candidateId)
            );
        }
    }

    function removeCandidate(
        uint256 electionId,
        uint256 candidateId
    ) external override {
        require(_hasRegistrarOrAdmin(msg.sender), "Not authorized");
        require(bytes(candidateParty[electionId][candidateId]).length != 0, "Not found");

        delete candidateParty[electionId][candidateId];
        delete candidateNames[electionId][candidateId];

        uint256[] storage ids = electionCandidateIds[electionId];

        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == candidateId) {
                ids[i] = ids[ids.length - 1];
                ids.pop();
                break;
            }
        }

        emit CandidateRemoved(electionId, candidateId);

        IAuditTrail(auditTrail).logAction(
            bytes32("REMOVE_CAND"),
            bytes32(candidateId)
        );
    }

    function getCandidates(
        uint256 electionId
    ) external view override returns (uint256[] memory) {
        return electionCandidateIds[electionId];
    }

    function getParty(
        uint256 electionId,
        uint256 candidateId
    ) external view override returns (string memory) {
        return candidateParty[electionId][candidateId];
    }

    function getCandidateNames(
        uint256 electionId,
        uint256 candidateId
    ) external view override returns (string[] memory) {
        return candidateNames[electionId][candidateId];
    }

    function _hasRegistrarOrAdmin(address account)
        internal
        view
        returns (bool)
    {
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