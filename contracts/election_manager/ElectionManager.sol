// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../ballot/IBallotFactory.sol";
import "../ballot/IBallot.sol";
import "../tally_verifier/ITallyVerifier.sol";
import "../access/IRoleBasedAccess.sol";

/// @dev Minimal interface for the extra lookup added to BallotFactory
interface IBallotLookup {
    function getElectionForBallot(address ballot) external view returns (uint256);
}

// Manages election lifecycle with sharded ballots
contract ElectionManager {

    enum ElectionState {
        Created,
        Live,
        Finalized
    }

    struct Election {
        string name;
        ElectionState state;
        uint256 shardCount;
    }

    uint256 private electionCounter;

    mapping(uint256 => Election) private elections;

    // Incremental aggregation: electionId => candidateId => total votes
    mapping(uint256 => mapping(uint256 => uint256)) private totalVotes;

    IBallotFactory private ballotFactory;
    ITallyVerifier private tallyVerifier;
    IRoleBasedAccess private rbac;

    // stores references to ballot factory, tally verifier, and rbac proxy
    constructor(
        address _ballotFactory,
        address _tallyVerifier,
        address _rbacProxy
    ) {
        ballotFactory = IBallotFactory(_ballotFactory);
        tallyVerifier = ITallyVerifier(_tallyVerifier);
        rbac = IRoleBasedAccess(_rbacProxy);
    }

    // checks if an address has the admin role
    function _hasAdminRole(address account) internal view returns (bool) {
        return rbac.hasRole(rbac.DEFAULT_ADMIN_ROLE(), account);
    }

    // Create election with shards
    function createElection(
        string calldata name,
        uint256 shardCount
    ) external returns (uint256) {
        require(_hasAdminRole(msg.sender), "Not authorized");
        require(shardCount > 0, "Invalid shard count");

        electionCounter++;

        elections[electionCounter] = Election({
            name: name,
            state: ElectionState.Created,
            shardCount: shardCount
        });

        // Deploy ballots per shard
        for (uint256 i = 0; i < shardCount; i++) {
            ballotFactory.deployBallot(electionCounter, i);
        }

        return electionCounter;
    }

    // Start election — transitions state and opens all shard ballots
    function startElection(uint256 electionId) external {
        require(_hasAdminRole(msg.sender), "Not authorized");
        require(
            elections[electionId].state == ElectionState.Created,
            "Wrong state"
        );

        elections[electionId].state = ElectionState.Live;

        uint256 shardCount = elections[electionId].shardCount;
        for (uint256 i = 0; i < shardCount; i++) {
            IBallot(ballotFactory.getBallot(electionId, i)).open();
        }
    }

    // Finalize election — verifies tally and closes all shard ballots
    function finalizeElection(
        uint256 electionId,
        bytes calldata proof,
        bytes calldata publicInputs
    ) external {
        require(_hasAdminRole(msg.sender), "Not authorized");
        require(
            elections[electionId].state == ElectionState.Live,
            "Election not live"
        );

        bool valid = tallyVerifier.verifyTally(
            electionId,
            proof,
            publicInputs
        );

        require(valid, "Invalid tally");

        elections[electionId].state = ElectionState.Finalized;

        uint256 shardCount = elections[electionId].shardCount;
        for (uint256 i = 0; i < shardCount; i++) {
            IBallot(ballotFactory.getBallot(electionId, i)).close();
        }
    }

    // Get ballot for shard
    function getBallot(
        uint256 electionId,
        uint256 shardId
    ) external view returns (address) {
        return ballotFactory.getBallot(electionId, shardId);
    }

    // Get election state
    function getElectionState(
        uint256 electionId
    ) external view returns (ElectionState) {
        return elections[electionId].state;
    }

    // increments the vote total for a candidate when a ballot calls in
    function incrementTotal(uint256 electionId, uint256 candidateId) external {
        // Verify the caller is a ballot registered for this electionId
        uint256 registeredId = IBallotLookup(address(ballotFactory))
            .getElectionForBallot(msg.sender);
        require(
            electionId != 0 && registeredId == electionId,
            "Not an authorized ballot"
        );
        totalVotes[electionId][candidateId] += 1;
    }

    // returns the pre-aggregated vote count for a candidate in an election
    function getElectionTotalVotes(
        uint256 electionId,
        uint256 candidateId
    ) external view returns (uint256) {
        return totalVotes[electionId][candidateId];
    }
}
