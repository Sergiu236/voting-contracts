// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Interface for tally verification
interface ITallyVerifier {
    function verifyTally(
        uint256 electionId,
        bytes calldata proof,
        bytes calldata publicInputs
    ) external returns (bool);
}
