// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/// @notice Interface for the Ballot contract
/// @dev Each Ballot belongs to exactly one election (immutable electionId).
interface IBallot {
    /// @notice Emitted when someone casts a vote
    /// @param voter the address of the voter (msg.sender)
    /// @param candidateId the candidate the voter selected
    event VoteCast(address indexed voter, uint256 indexed candidateId);

    /// @notice Emitted when the ballot is opened
    event BallotOpened();

    /// @notice Emitted when the ballot is closed
    event BallotClosed();

    /// @notice cast a vote for a candidate
    /// @param index the index of the voter in the Merkle tree
    /// @param voterHash the hashed identifier of the voter
    /// @param proof the Merkle proof to show this voter is in the snapshot
    /// @param candidateId the candidate the voter selects
    function castVote(
        uint256 index,
        bytes32 voterHash,
        bytes32[] calldata proof,
        uint256 candidateId
    ) external;

    /// @notice open the ballot (only admin or registrar)
    function open() external;

    /// @notice close the ballot (only admin or registrar)
    function close() external;

    /// @notice check if the ballot is currently open
    function isOpen() external view returns (bool);

    /// @notice return the electionId this ballot belongs to
    function electionId() external view returns (uint256);
}
