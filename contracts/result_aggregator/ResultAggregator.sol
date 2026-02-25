// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "../ballot/IBallotFactory.sol";
import "../ballot/IBallot.sol";
import "../candidate_registry/ICandidateRegistry.sol";

/// @dev Minimal interface to read pre-aggregated totals from ElectionManager.
interface IElectionTotals {
    function getElectionTotalVotes(
        uint256 electionId,
        uint256 candidateId
    ) external view returns (uint256);
}

/// @title ResultAggregator
/// @notice Aggregates on-chain tallies from ballot shards
/// @dev Totals are maintained incrementally by ElectionManager at write-time,
///      so read operations are O(candidates) instead of O(candidates × shards).
contract ResultAggregator {

    IBallotFactory private ballotFactory;
    ICandidateRegistry private candidateRegistry;
    IElectionTotals private electionManager;

    constructor(
        address _ballotFactory,
        address _candidateRegistry,
        address _electionManager
    ) {
        ballotFactory = IBallotFactory(_ballotFactory);
        candidateRegistry = ICandidateRegistry(_candidateRegistry);
        electionManager = IElectionTotals(_electionManager);
    }

    /// @notice Total votes for one candidate — reads directly from ElectionManager (O(1))
    function getTotalVotes(
        uint256 electionId,
        uint256 candidateId
    ) external view returns (uint256 total) {
        total = electionManager.getElectionTotalVotes(electionId, candidateId);
    }

    /// @notice Full results for an election — O(candidates), no shard loops
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
        candidateIds = candidateRegistry.getCandidates(electionId);
        votes = new uint256[](candidateIds.length);

        for (uint256 c = 0; c < candidateIds.length; c++) {
            votes[c] = electionManager.getElectionTotalVotes(electionId, candidateIds[c]);
        }
    }
}
