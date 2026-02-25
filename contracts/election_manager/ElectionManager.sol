// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../ballot/IBallotFactory.sol";
import "../tally_verifier/ITallyVerifier.sol";

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

    IBallotFactory private ballotFactory;
    ITallyVerifier private tallyVerifier;

    constructor(
        address _ballotFactory,
        address _tallyVerifier
    ) {
        ballotFactory = IBallotFactory(_ballotFactory);
        tallyVerifier = ITallyVerifier(_tallyVerifier);
    }

    // Create election with shards
    function createElection(
        string calldata name,
        uint256 shardCount
    ) external returns (uint256) {
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

    // Start election
    function startElection(uint256 electionId) external {
        require(
            elections[electionId].state == ElectionState.Created,
            "Wrong state"
        );

        elections[electionId].state = ElectionState.Live;
    }

    // Finalize election (tally verification only)
    function finalizeElection(
        uint256 electionId,
        bytes calldata proof,
        bytes calldata publicInputs
    ) external {
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
}
