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

    // cast a vote for a candidate after proving voter eligibility
    function castVote(
        uint256 index,
        bytes32 voterHash,
        bytes32[] calldata proof,
        uint256 candidateId
    ) external;

    // open the ballot so voting can begin
    function open() external;

    // close the ballot to stop accepting votes
    function close() external;

    // check if this ballot is currently accepting votes
    function isOpen() external view returns (bool);

    // return the election id this ballot is linked to
    function electionId() external view returns (uint256);

    /// read on-chain tally for a candidate (per shard)
    function getVoteCount(uint256 candidateId) external view returns (uint256);
}
