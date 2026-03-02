// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { IBallot } from "./IBallot.sol";
import { IVoterRegistry } from "../voter_registry/IVoterRegistry.sol";
import { ICandidateRegistry } from "../candidate_registry/ICandidateRegistry.sol";
import { IRoleBasedAccess } from "../access/IRoleBasedAccess.sol";
import { IAuditTrail } from "../audit/IAuditTrail.sol";

/// @dev Minimal interface used to notify ElectionManager of each vote cast.
interface IElectionManagerTotals {
    function incrementTotal(uint256 electionId, uint256 candidateId) external;
}

/// @title Ballot
/// @notice Records votes for a single election.
/// @dev Ballot enforces voting rules AND tallies votes per candidate.
contract Ballot is IBallot {
    uint256 public immutable override electionId;

    address public immutable rbacProxy;
    address public immutable voterRegistry;
    address public immutable candidateRegistry;
    address public immutable auditTrail;

    /// @notice Address of the ElectionManager to notify on each vote.
    ///         address(0) means incremental aggregation is disabled (tests /
    ///         standalone deployments that do not need it).
    address public immutable electionManager;

    bool private ballotOpen;

    //candidateId => votes (on-chain tally)
    mapping(uint256 => uint256) private voteCounts;

    // sets up the ballot with election config and contract dependencies
    constructor(
        uint256 _electionId,
        address _rbacProxy,
        address _voterRegistry,
        address _candidateRegistry,
        address _auditTrail,
        address _electionManager
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
        electionManager = _electionManager; // may be address(0)
    }

    // opens the ballot so voters can start casting votes
    function open() external override {
        require(_hasRegistrarOrAdmin(msg.sender), "Not authorized");
        ballotOpen = true;
        emit BallotOpened();
        IAuditTrail(auditTrail).logAction(bytes32("BALLOT_OPEN"), bytes32(electionId));
    }

    // closes the ballot to stop accepting votes
    function close() external override {
        require(_hasRegistrarOrAdmin(msg.sender), "Not authorized");
        ballotOpen = false;
        emit BallotClosed();
        IAuditTrail(auditTrail).logAction(bytes32("BALLOT_CLOSE"), bytes32(electionId));
    }

    // returns whether the ballot is currently accepting votes
    function isOpen() external view override returns (bool) {
        return ballotOpen;
    }

    // cast a vote after verifying voter eligibility and candidate validity
    function castVote(
        uint256 index,
        bytes32 voterHash,
        bytes32[] calldata proof,
        uint256 candidateId
    ) external override {
        require(ballotOpen, "Ballot closed");

        // marks voter as voted inside registry
        IVoterRegistry(voterRegistry).vote(
            electionId,
            index,
            voterHash,
            proof
        );

        uint256[] memory validCandidates =
            ICandidateRegistry(candidateRegistry).getCandidates(electionId);

        bool found;
        for (uint256 i = 0; i < validCandidates.length; i++) {
            if (validCandidates[i] == candidateId) {
                found = true;
                break;
            }
        }
        require(found, "Invalid candidate");

        //on-chain tally
        voteCounts[candidateId] += 1;

        // Notify ElectionManager to keep global totals up-to-date (write-time aggregation)
        if (electionManager != address(0)) {
            IElectionManagerTotals(electionManager).incrementTotal(electionId, candidateId);
        }

        emit VoteCast(msg.sender, candidateId);
        IAuditTrail(auditTrail).logAction(bytes32("VOTE_CAST"), bytes32(electionId));
    }

    // read tally
    function getVoteCount(uint256 candidateId)
        external
        view
        override
        returns (uint256)
    {
        return voteCounts[candidateId];
    }

    // checks if an address holds registrar or admin role
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
