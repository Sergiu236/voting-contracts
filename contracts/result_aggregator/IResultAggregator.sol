// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/// @title IResultAggregator
/// @notice Interface for aggregating on-chain vote tallies
interface IResultAggregator {

    /// @notice Returns total votes for a candidate across all shards
    function getTotalVotes(
        uint256 electionId,
        uint256 candidateId
    ) external view returns (uint256);

    /// @notice Returns full results for an election
    function getResults(
        uint256 electionId
    )
        external
        view
        returns (
            uint256[] memory candidateIds,
            uint256[] memory votes
        );
}
