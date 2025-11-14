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

    constructor(address _rbacProxy) {
        require(_rbacProxy != address(0), "RBAC proxy zero");
        rbacProxy = _rbacProxy;
    }

    function logAction(bytes32 actionCode, bytes32 refId) external override {
        // check RBAC roles via proxy
        bool isRegistrar = IRoleBasedAccess(rbacProxy).hasRole(
            IRoleBasedAccess(rbacProxy).REGISTRAR_ROLE(),
            tx.origin
        );
        bool isAuditor = IRoleBasedAccess(rbacProxy).hasRole(
            IRoleBasedAccess(rbacProxy).AUDITOR_ROLE(),
            tx.origin
        );
        bool isAdmin = IRoleBasedAccess(rbacProxy).hasRole(
            IRoleBasedAccess(rbacProxy).DEFAULT_ADMIN_ROLE(),
            tx.origin
        );

        require(isRegistrar || isAuditor || isAdmin, "Not authorized to log");

        emit SystemAction(msg.sender, tx.origin, actionCode, refId, block.timestamp);
    }
}
