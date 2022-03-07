// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./VeERC20.sol";

interface IBoostedMasterChefRip {
    function updateBoost(address, uint256) external;
}

/// @title Vote Escrow Rip Token - veRip
/// @author Dex Rip
/// @notice Infinite supply, used to receive extra farming yields and voting power
contract VeRipToken is VeERC20("VeRipToken", "veRip"), Ownable {
    /// @notice the BoostedMasterChefRip contract
    IBoostedMasterChefRip public boostedMasterChef;

    /// @dev Creates `_amount` token to `_to`. Must only be called by the owner (VeRipStaking)
    /// @param _to The address that will receive the mint
    /// @param _amount The amount to be minted
    function mint(address _to, uint256 _amount) external onlyOwner {
        _mint(_to, _amount);
    }

    /// @dev Destroys `_amount` tokens from `_from`. Callable only by the owner (VeRipStaking)
    /// @param _from The address that will burn tokens
    /// @param _amount The amount to be burned
    function burnFrom(address _from, uint256 _amount) external onlyOwner {
        _burn(_from, _amount);
    }

    /// @dev Sets the address of the master chef contract this updates
    /// @param _boostedMasterChef the address of BoostedMasterChefRip
    function setBoostedMasterChefRip(address _boostedMasterChef) external onlyOwner {
        // We allow 0 address here if we want to disable the callback operations
        boostedMasterChef = IBoostedMasterChefRip(_boostedMasterChef);
    }

    function _afterTokenOperation(address _account, uint256 _newBalance) internal override {
        if (address(boostedMasterChef) != address(0)) {
            boostedMasterChef.updateBoost(_account, _newBalance);
        }
    }
}
