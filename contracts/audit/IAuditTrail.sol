// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/// @notice Interface for centralized AuditTrail logging contract ("black box contract")
interface IAuditTrail {
    /// @notice Emitted when authorized roles do an action, this is recorded.
    /// @param caller the contract that invoked the log
    /// @param actor the originating EOA (tx.origin)
    /// @param actionCode short descrption of the action
    /// @param refId reference id for correlation
    /// @param timestamp block.timestamp of the log
    event SystemAction(
        address indexed caller,
        address indexed actor,
        bytes32 indexed actionCode,
        bytes32 refId,
        uint256 timestamp
    );
    
    /// @param actionCode bytes32 short code describing the action
    /// @param refId bytes32 reference id for correlation
    function logAction(bytes32 actionCode, bytes32 refId) external;
}