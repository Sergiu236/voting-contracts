// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ITallyVerifier.sol";

// Mock verifier for election results
contract TallyVerifier is ITallyVerifier {

    // Emitted after tally verification
    event VerifiedTally(
        uint256 electionId,
        bool valid
    );

    // verifies the tally for an election and emits the result
    function verifyTally(
        uint256 electionId,
        bytes calldata, // proof (unused for now)
        bytes calldata  // publicInputs (unused for now)
    ) external override returns (bool) {

        // Always valid in this mock
        bool result = true;

        emit VerifiedTally(electionId, result);
        return result;
    }
}
