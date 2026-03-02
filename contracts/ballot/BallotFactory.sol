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

    // ballot address => electionId (0 means not registered)
    mapping(address => uint256) private ballotToElection;

    address private voterRegistry;
    address private candidateRegistry;
    address private rbacProxy;
    address private auditTrail;

    // ElectionManager address passed to every deployed Ballot
    address private electionManager;

    // Deployer address used to restrict setElectionManager
    address private immutable deployer;

    // stores shared contract addresses used by all deployed ballots
    constructor(
        address _voterRegistry,
        address _candidateRegistry,
        address _rbacProxy,
        address _auditTrail
    ) {
        voterRegistry = _voterRegistry;
        candidateRegistry = _candidateRegistry;
        rbacProxy = _rbacProxy;
        auditTrail = _auditTrail;
        deployer = msg.sender;
    }

    // wires up the election manager address after deployment, can only be called once
    function setElectionManager(address _electionManager) external {
        require(msg.sender == deployer, "Not authorized");
        require(electionManager == address(0), "Already set");
        require(_electionManager != address(0), "Zero address");
        electionManager = _electionManager;
    }

    // returns the election id a ballot was deployed for, or 0 if unknown
    function getElectionForBallot(address ballot) external view returns (uint256) {
        return ballotToElection[ballot];
    }

    // deploys a new ballot contract for a given election shard
    function deployBallot(
        uint256 electionId,
        uint256 shardId
    ) external override returns (address) {
        require(ballots[electionId][shardId] == address(0), "Ballot exists");

        Ballot ballot = new Ballot(
            electionId,
            rbacProxy,
            voterRegistry,
            candidateRegistry,
            auditTrail,
            electionManager
        );

        ballots[electionId][shardId] = address(ballot);
        ballotToElection[address(ballot)] = electionId;

        if (shardId + 1 > shardCounts[electionId]) {
            shardCounts[electionId] = shardId + 1;
        }

        emit BallotDeployed(electionId, shardId, address(ballot));

        return address(ballot);
    }

    // returns the ballot address for a specific election shard
    function getBallot(
        uint256 electionId,
        uint256 shardId
    ) external view override returns (address) {
        return ballots[electionId][shardId];
    }

    // returns the number of shards deployed for an election
    function getShardCount(
        uint256 electionId
    ) external view override returns (uint256) {
        return shardCounts[electionId];
    }
}