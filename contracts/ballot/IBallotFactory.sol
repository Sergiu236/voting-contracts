// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { IBallot } from "./IBallot.sol";

/// @notice Interface for the BallotFactory
/// @dev Factory is responsible for deploying new Ballot contracts, one per election.
interface IBallotFactory {
    /// @notice Emitted when a new Ballot contract is deployed
    /// @param electionId the election this ballot belongs to
    /// @param ballot the address of the deployed Ballot contract
    event BallotDeployed(uint256 indexed electionId, address ballot);

    /// @notice Deploy a new Ballot for a given election
    /// @param electionId the id of the election
    /// @return ballot the address of the newly deployed Ballot
    function deployBallot(uint256 electionId) external returns (address ballot);

    /// @notice Get the ballot address for an election
    /// @param electionId the id of the election
    /// @return ballot the Ballot contract address
    function getBallot(uint256 electionId) external view returns (address ballot);
}
