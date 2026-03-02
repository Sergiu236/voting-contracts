// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { IAuditTrail } from "./IAuditTrail.sol";
import { IRoleBasedAccess } from "../access/IRoleBasedAccess.sol";

/// @title AuditTrailLogic
/// @notice Centralized black box logger for the voting system.
/// Only accounts with DEFAULT_ADMIN, REGISTRAR or AUDITOR roles in RBAC proxy can log
contract AuditTrail is IAuditTrail {
    /// @notice address of the RoleBasedAccess proxy
    address public immutable rbacProxy;

    // sets the rbac proxy address used for role checks
    constructor(address _rbacProxy) {
        require(_rbacProxy != address(0), "RBAC proxy zero");
        rbacProxy = _rbacProxy;
    }

    // checks caller roles and emits a system action log entry
    function logAction(bytes32 actionCode, bytes32 refId) external override {
        // check RBAC roles via proxy — authorize the direct caller, not tx origin
        bool isRegistrar = IRoleBasedAccess(rbacProxy).hasRole(
            IRoleBasedAccess(rbacProxy).REGISTRAR_ROLE(),
            msg.sender
        );
        bool isAuditor = IRoleBasedAccess(rbacProxy).hasRole(
            IRoleBasedAccess(rbacProxy).AUDITOR_ROLE(),
            msg.sender
        );
        bool isAdmin = IRoleBasedAccess(rbacProxy).hasRole(
            IRoleBasedAccess(rbacProxy).DEFAULT_ADMIN_ROLE(),
            msg.sender
        );

        require(isRegistrar || isAuditor || isAdmin, "Not authorized to log");

        // tx.origin is retained in the event as a passive audit record of who
        // initiated the outer transaction — it is NOT used for authorization.
        emit SystemAction(msg.sender, tx.origin, actionCode, refId, block.timestamp);
    }
}
