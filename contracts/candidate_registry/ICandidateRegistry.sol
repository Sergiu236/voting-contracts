// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Interface for candidate registry (candidates per election)
interface ICandidateRegistry {
    event CandidateAdded(
        uint256 indexed electionId,
        uint256 indexed candidateId,
        string party
    );

    event CandidateRemoved(
        uint256 indexed electionId,
        uint256 indexed candidateId
    );

    /// Add multiple candidates for an election
    function addCandidates(
        uint256 electionId,
        string[] calldata parties,
        string[][] calldata namesList
    ) external;

    /// Remove candidate from an election
    function removeCandidate(
        uint256 electionId,
        uint256 candidateId
    ) external;

    /// Get all candidate IDs for an election
    function getCandidates(
        uint256 electionId
    ) external view returns (uint256[] memory);

    /// Get party of a candidate for an election
    function getParty(
        uint256 electionId,
        uint256 candidateId
    ) external view returns (string memory);

    /// Get names of a candidate for an election
    function getCandidateNames(
        uint256 electionId,
        uint256 candidateId
    ) external view returns (string[] memory);
}