// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IBallotFactory.sol";
import "./Ballot.sol";

// Factory that deploys ballots per election shard
contract BallotFactory is IBallotFactory {

    // electionId => shardId => ballot
    mapping(uint256 => mapping(uint256 => address)) private ballots;

    // electionId => shard count
    mapping(uint256 => uint256) private shardCounts;

    address private voterRegistry;
    address private candidateRegistry;
    address private voteToken;
    address private roleBasedAccess;

    constructor(
        address _voterRegistry,
        address _candidateRegistry,
        address _voteToken,
        address _roleBasedAccess
    ) {
        voterRegistry = _voterRegistry;
        candidateRegistry = _candidateRegistry;
        voteToken = _voteToken;
        roleBasedAccess = _roleBasedAccess;
    }

    function deployBallot(
        uint256 electionId,
        uint256 shardId
    ) external override returns (address) {
        require(ballots[electionId][shardId] == address(0), "Ballot exists");

        Ballot ballot = new Ballot(
            electionId,
            voterRegistry,
            candidateRegistry,
            voteToken,
            roleBasedAccess
        );

        ballots[electionId][shardId] = address(ballot);

        if (shardId + 1 > shardCounts[electionId]) {
            shardCounts[electionId] = shardId + 1;
        }

        emit BallotDeployed(electionId, shardId, address(ballot));

        return address(ballot);
    }

    function getBallot(
        uint256 electionId,
        uint256 shardId
    ) external view override returns (address) {
        return ballots[electionId][shardId];
    }

    function getShardCount(
        uint256 electionId
    ) external view override returns (uint256) {
        return shardCounts[electionId];
    }
}