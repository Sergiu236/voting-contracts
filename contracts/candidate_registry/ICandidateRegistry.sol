// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/// @notice Interface for candidate registry
/// @dev Stores candidates directly on-chain (party + names).
interface ICandidateRegistry {
    event CandidateAdded(uint256 indexed candidateId, string party, string[] names, address indexed registrar);
    event CandidateRemoved(uint256 indexed candidateId, address indexed registrar);
    event CandidateSnapshot(uint256 indexed electionId, uint256 timestamp);

    /// Add a new candidate (party + list of names). ID is auto-generated.
    function addCandidate(string calldata party, string[] calldata names) external;

    /// Remove a candidate by id
    function removeCandidate(uint256 candidateId) external;

    /// Get party of a candidate
    function getParty(uint256 candidateId) external view returns (string memory);

    /// Get all names for a candidate
    function getCandidateNames(uint256 candidateId) external view returns (string[] memory);

    /// Take a snapshot of current candidates for an election
    function snapshot(uint256 electionId) external;

    /// Get all candidate ids for a given election
    function getCandidates(uint256 electionId) external view returns (uint256[] memory);
}
