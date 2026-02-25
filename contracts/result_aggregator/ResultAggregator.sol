// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "../ballot/IBallotFactory.sol";
import "../ballot/IBallot.sol";
import "../candidate_registry/ICandidateRegistry.sol";

/// @title ResultAggregator
/// @notice Aggregates on-chain tallies from ballot shards
/// @dev Read-only helper, does not modify state
contract ResultAggregator {

    IBallotFactory private ballotFactory;
    ICandidateRegistry private candidateRegistry;

    constructor(
        address _ballotFactory,
        address _candidateRegistry
    ) {
        ballotFactory = IBallotFactory(_ballotFactory);
        candidateRegistry = ICandidateRegistry(_candidateRegistry);
    }

    /// @notice Total votes for one candidate across all shards
    function getTotalVotes(
        uint256 electionId,
        uint256 candidateId
    ) external view returns (uint256 total) {

        uint256 shardCount = ballotFactory.getShardCount(electionId);

        for (uint256 i = 0; i < shardCount; i++) {
            address ballot = ballotFactory.getBallot(electionId, i);
            total += IBallot(ballot).getVoteCount(candidateId);
        }
    }

    /// @notice Full results for an election
    function getResults(
        uint256 electionId
    )
        external
        view
        returns (
            uint256[] memory candidateIds,
            uint256[] memory votes
        )
    {
        // ✅ CORRECT: candidates are per election
        candidateIds = candidateRegistry.getCandidates(electionId);
        votes = new uint256[](candidateIds.length);

        uint256 shardCount = ballotFactory.getShardCount(electionId);

        for (uint256 c = 0; c < candidateIds.length; c++) {
            uint256 sum;

            for (uint256 s = 0; s < shardCount; s++) {
                address ballot = ballotFactory.getBallot(electionId, s);
                sum += IBallot(ballot).getVoteCount(candidateIds[c]);
            }

            votes[c] = sum;
        }
    }
}
