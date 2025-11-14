// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/// @notice Interface for voter registry
/// @dev We only keep snapshots here, not the full list of voters.
interface IVoterRegistry {
    /// This event is emitted when we take a snapshot for an election
    event SnapshotTaken(uint256 indexed electionId, bytes32 merkleRoot, uint256 timestamp);

    /// this event is fired when someone actually votes
    event Voted(uint256 indexed electionId, uint256 indexed index, bytes32 voterHash);

    /// Save a new snapshot for an election, with the merkle root of the voter list
    function snapshot(uint256 electionId, bytes32 merkleRoot) external;

    /// Get the merkle root for a given election
    function getSnapshot(uint256 electionId) external view returns (bytes32);

    /// Verify if a voter hash is inside a snapshot using a merkle proof
    /// @param electionId the election we check
    /// @param leaf the hash of the voter
    /// @param proof the path of sibling hashes needed to rebuild the root
    function verifyProof(
        uint256 electionId,
        bytes32 leaf,
        bytes32[] calldata proof
    ) external view returns (bool);

    /// this function lets a voter actually cast a vote, it will also check that he didnt vote before
    /// @param electionId which election this vote is for
    /// @param index the index we gave the voter offchain
    /// @param voterHash the hash we stored in the tree
    /// @param proof the proof from the tree to show this voter exists
    function vote(
        uint256 electionId,
        uint256 index,
        bytes32 voterHash,
        bytes32[] calldata proof
    ) external;

    /// just a helper to check if a voter index already voted or not
    /// @param electionId the election we want to check
    /// @param index the index of the voter
    function hasVoted(uint256 electionId, uint256 index) external view returns (bool);
}
