// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Factory interface for ballots
interface IBallotFactory {

    event BallotDeployed(
        uint256 indexed electionId,
        uint256 indexed shardId,
        address ballot
    );

    // Deploy a ballot for an election shard
    function deployBallot(
        uint256 electionId,
        uint256 shardId
    ) external returns (address);

    // Get a ballot for an election shard
    function getBallot(
        uint256 electionId,
        uint256 shardId
    ) external view returns (address);

    // Get number of shards for an election
    function getShardCount(
        uint256 electionId
    ) external view returns (uint256);
}
