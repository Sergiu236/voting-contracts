// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { IBallot } from "./IBallot.sol";
import { IVoterRegistry } from "../voter_registry/IVoterRegistry.sol";
import { ICandidateRegistry } from "../candidate_registry/ICandidateRegistry.sol";
import { IRoleBasedAccess } from "../access/IRoleBasedAccess.sol";
import { IAuditTrail } from "../audit/IAuditTrail.sol";

/// @title Ballot
/// @notice Records votes for a single election.
/// @dev Ballot only enforces voting rules and emits events. It does not tally results.
contract Ballot is IBallot {
    /// @notice The election this ballot belongs to (immutable)
    uint256 public immutable override electionId;

    address public immutable rbacProxy;
    address public immutable voterRegistry;
    address public immutable candidateRegistry;
    address public immutable auditTrail;

    // is the ballot currently open
    bool private ballotOpen;

    constructor(
        uint256 _electionId,
        address _rbacProxy,
        address _voterRegistry,
        address _candidateRegistry,
        address _auditTrail
    ) {
        require(_electionId != 0, "invalid electionId");
        require(_rbacProxy != address(0), "rbac zero");
        require(_voterRegistry != address(0), "voter registry zero");
        require(_candidateRegistry != address(0), "candidate registry zero");
        require(_auditTrail != address(0), "audit zero");

        electionId = _electionId;
        rbacProxy = _rbacProxy;
        voterRegistry = _voterRegistry;
        candidateRegistry = _candidateRegistry;
        auditTrail = _auditTrail;
    }

    /// @notice open the ballot (only registrar or admin)
    function open() external override {
        require(_hasRegistrarOrAdmin(msg.sender), "Not authorized");
        ballotOpen = true;
        emit BallotOpened();
        IAuditTrail(auditTrail).logAction(bytes32("BALLOT_OPEN"), bytes32(electionId));
    }

    /// @notice close the ballot (only registrar or admin)
    function close() external override {
        require(_hasRegistrarOrAdmin(msg.sender), "Not authorized");
        ballotOpen = false;
        emit BallotClosed();
        IAuditTrail(auditTrail).logAction(bytes32("BALLOT_CLOSE"), bytes32(electionId));
    }

    /// @notice check if the ballot is currently open
    function isOpen() external view override returns (bool) {
        return ballotOpen;
    }

    /// @notice voter casts a vote
    function castVote(
        uint256 index,
        bytes32 voterHash,
        bytes32[] calldata proof,
        uint256 candidateId
    ) external override {
        // 1. ballot must be open
        require(ballotOpen, "Ballot closed");

        // 2. check voter eligibility & uniqueness (marks as voted inside VoterRegistry)
        IVoterRegistry(voterRegistry).vote(electionId, index, voterHash, proof);

        // 3. check candidate exists in snapshot
        uint256[] memory validCandidates = ICandidateRegistry(candidateRegistry).getCandidates(electionId);
        bool found = false;
        for (uint256 i = 0; i < validCandidates.length; i++) {
            if (validCandidates[i] == candidateId) {
                found = true;
                break;
            }
        }
        require(found, "Invalid candidate");

        // 4. record vote by emitting event only
        emit VoteCast(msg.sender, candidateId);
        IAuditTrail(auditTrail).logAction(bytes32("VOTE_CAST"), bytes32(electionId));
    }

    /// @notice helper for role checks
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
