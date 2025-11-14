// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { IRoleBasedAccess } from "./IRoleBasedAccess.sol";

/// @title RoleBasedAccessProxy
/// @notice Upgradeable proxy that delegates calls to a logic contract.
///         Only addresses with UPGRADER_ROLE in the logic contract can upgrade it.
contract RoleBasedAccessProxy {
    // EIP-1967 storage slot for implementation address
    // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 private constant _IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    // Events to see who call upgrade function and which new contract is assigned
    event Upgraded(address indexed newLogicContract, address indexed sender);

    // Constructor
    constructor(address _currentLogicContract, address _admin) {
        _setLogicContract(_currentLogicContract);

        // call initialize(admin) in logic contract context
        (bool success, ) = _currentLogicContract.delegatecall(
            abi.encodeWithSignature("initialize(address)", _admin)
        );
        require(success, "Initialization failed");
    }

    // internal getter for current logic contract
    function _getLogicContract() internal view returns (address implementationSlot) {
        assembly {
            implementationSlot := sload(_IMPLEMENTATION_SLOT)
        }
    }

    // internal setter for current logic contract
    function _setLogicContract(address _newLogicContract) private {
        assembly {
            sstore(_IMPLEMENTATION_SLOT, _newLogicContract)
        }
    }

    // delegate all calls and data to the currentLogicContract (used as fallback for functions not defined in this proxy file)
    fallback() external payable {
        _delegate(_getLogicContract());
    }

    receive() external payable {
        _delegate(_getLogicContract());
    }

    // Upgrade function (by UPGRADER_ROLE only)
    // change the logic contract address to a new one
    function upgradeTo(address _newLogicContract) external {
        bool isUpgrader = IRoleBasedAccess(address(this))
            .hasRole(IRoleBasedAccess(address(this)).UPGRADER_ROLE(), msg.sender);

        require(isUpgrader, "Not upgrader");
        _setLogicContract(_newLogicContract);
        emit Upgraded(_newLogicContract, msg.sender);
    }

    // the actual implementation of delegate 
    function _delegate(address _currentLogicContract) internal {
        assembly {
            // copy msg.data in transaction memory, parameters:
            // 1st parameter = the offset of calldata 
            // 2nd paramter = is the offset of "memory" 
            // 3rd parameter = return the size of calldata in bytes)
            calldatacopy(0, 0, calldatasize())

            // delegatecall to currentLogicContract
            // delegate call signature is:
            // delegatecall(gas, addr, inOffset, inSize, outOffset, outSize)
            let result := delegatecall(gas(), _currentLogicContract, 0, calldatasize(), 0, 0)

            // copy return data, parameters are:
            // 1st parameter = destination in memory of transaction.
            // 2nd paramter = offset in returndata buffer. EVM keeps the raw returndata in a buffer.
            // 3rd parameter = how many bytes to copy)
            //so practically it overwrites the calldata we copied earlier (as it works on the same temporary slot named memory)
            returndatacopy(0, 0, returndatasize())

            // return or revert
            switch result
            case 0 { revert(0, returndatasize()) } // revert occur anytime an error appear
            default { return(0, returndatasize()) } // reads returndatasize() bytes from memory at offset 0.
        }
    }
}
