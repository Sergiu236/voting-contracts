// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { IRoleBasedAccess } from "./IRoleBasedAccess.sol";

/**
 * @title RoleBasedAccess
 * @notice This contract controls who can do what in the voting system.
 *         It uses OpenZeppelin’s AccessControlEnumerable (upgradeable version).
 *         Has roles with names: ADMIN, REGISTRAR, AUDITOR, UPGRADER.
 *         Because it’s upgradeable, we use an initialize function instead of a constructor. (so the proxy holds the state)
 */

contract RoleBasedAccessLogicV1 is IRoleBasedAccess {
    mapping(bytes32 => mapping(address => bool)) private _roles;

    //Role constants 
    bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");
    bytes32 public constant REGISTRAR_ROLE     = keccak256("REGISTRAR_ROLE");
    bytes32 public constant AUDITOR_ROLE       = keccak256("AUDITOR_ROLE");
    bytes32 public constant UPGRADER_ROLE      = keccak256("UPGRADER_ROLE");

    // Events (for logs)
    event RoleAssigned(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleDeleted(bytes32 indexed role, address indexed account, address indexed sender);

    // Initializer (called once through proxy)
    bool private _initialized;

    function initialize(address admin) external {
        require(!_initialized, "Already initialized once");
        _roles[DEFAULT_ADMIN_ROLE][admin] = true;
        _initialized = true;
    }

    // to check if an account has a specific role
    function hasRole(bytes32 role, address account) external view override returns (bool) {
        return _roles[role][account];
    }

    //to assign a role to an account
    function assignRole(bytes32 role, address account) external override {
        require(_roles[DEFAULT_ADMIN_ROLE][msg.sender], "Not admin");
        if (!_roles[role][account]) {
            _roles[role][account] = true;
            emit RoleAssigned(role, account, msg.sender);
        }
    }

    // to revoke a role of an account
    function deleteRole(bytes32 role, address account) external override {
        require(_roles[DEFAULT_ADMIN_ROLE][msg.sender], "Not admin");
        if (_roles[role][account]) {
            _roles[role][account] = false;
            emit RoleDeleted(role, account, msg.sender);
        }
    }
}