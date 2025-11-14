// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { IBallotFactory } from "./IBallotFactory.sol";
import { IBallot } from "./IBallot.sol";
import { Ballot } from "./Ballot.sol";
import { IRoleBasedAccess } from "../access/IRoleBasedAccess.sol";
import { IAuditTrail } from "../audit/IAuditTrail.sol";

/// @title BallotFactory
/// @notice Deploys Ballot contracts, one per election.
/// @dev For now we use `new Ballot(...)` directly (simple). Later we could use minimal proxy for efficiency.
contract BallotFactory is IBallotFactory {
    address public immutable rbacProxy;
    address public immutable voterRegistry;
    address public immutable candidateRegistry;
    address public immutable auditTrail;

    // electionId => ballot address
    mapping(uint256 => address) private ballots;

    constructor(
        address _rbacProxy,
        address _voterRegistry,
        address _candidateRegistry,
        address _auditTrail
    ) {
        require(_rbacProxy != address(0), "rbac zero");
        require(_voterRegistry != address(0), "voter registry zero");
        require(_candidateRegistry != address(0), "candidate registry zero");
        require(_auditTrail != address(0), "audit zero");

        rbacProxy = _rbacProxy;
        voterRegistry = _voterRegistry;
        candidateRegistry = _candidateRegistry;
        auditTrail = _auditTrail;
    }

    /// @notice Deploy a new Ballot for a given election
    function deployBallot(uint256 electionId) external override returns (address ballot) {
        require(electionId != 0, "invalid electionId");
        require(ballots[electionId] == address(0), "already exists");

        // create a new Ballot instance
        Ballot newBallot = new Ballot(
            electionId,
            rbacProxy,
            voterRegistry,
            candidateRegistry,
            auditTrail
        );

        ballots[electionId] = address(newBallot);

        emit BallotDeployed(electionId, address(newBallot));
        IAuditTrail(auditTrail).logAction(bytes32("BALLOT_DEPLOY"), bytes32(electionId));

        return address(newBallot);
    }

    /// @notice Get the ballot address for an election
    function getBallot(uint256 electionId) external view override returns (address ballot) {
        return ballots[electionId];
    }
}
