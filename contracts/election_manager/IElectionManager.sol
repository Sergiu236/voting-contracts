// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Interface for election lifecycle management
interface IElectionManager {
    function createElection(string calldata name) external returns (uint256);
    function startElection(uint256 electionId) external;
    function finalizeElection(
        uint256 electionId,
        bytes calldata proof,
        bytes calldata publicInputs
    ) external;

    function getBallot(uint256 electionId) external view returns (address);
}
