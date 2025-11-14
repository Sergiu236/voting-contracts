// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/// @notice A small interface that keeps role names and check functions so other contracts can use them
interface IRoleBasedAccess {
    // role constants
    function DEFAULT_ADMIN_ROLE() external view returns (bytes32);
    function REGISTRAR_ROLE()     external view returns (bytes32);
    function AUDITOR_ROLE()       external view returns (bytes32);
    function UPGRADER_ROLE()      external view returns (bytes32);

    // role checks
    function hasRole(bytes32 role, address account) external view returns (bool);

    // role management
    function assignRole(bytes32 role, address account) external;
    function deleteRole(bytes32 role, address account) external;

}