// SPDX-License-Identifier: MIT

pragma solidity >0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

// RipBar is the coolest bar in town. You come in with some Rip, and leave with more! The longer you stay, the more Rip you get.
//
// This contract handles swapping to and from xRip, RipSwap's staking token.
contract RipBar is ERC20("RipBar", "xRip") {
    using SafeMath for uint256;
    IERC20 public Rip;

    // Define the Rip token contract
    constructor(IERC20 _Rip) public {
        Rip = _Rip;
    }

    // Enter the bar. Pay some Rips. Earn some shares.
    // Locks Rip and mints xRip
    function enter(uint256 _amount) public {
        // Gets the amount of Rip locked in the contract
        uint256 totalRip = Rip.balanceOf(address(this));
        // Gets the amount of xRip in existence
        uint256 totalShares = totalSupply();
        // If no xRip exists, mint it 1:1 to the amount put in
        if (totalShares == 0 || totalRip == 0) {
            _mint(msg.sender, _amount);
        }
        // Calculate and mint the amount of xRip the Rip is worth. The ratio will change overtime, as xRip is burned/minted and Rip deposited + gained from fees / withdrawn.
        else {
            uint256 what = _amount.mul(totalShares).div(totalRip);
            _mint(msg.sender, what);
        }
        // Lock the Rip in the contract
        Rip.transferFrom(msg.sender, address(this), _amount);
    }

    // Leave the bar. Claim back your Rips.
    // Unlocks the staked + gained Rip and burns xRip
    function leave(uint256 _share) public {
        // Gets the amount of xRip in existence
        uint256 totalShares = totalSupply();
        // Calculates the amount of Rip the xRip is worth
        uint256 what = _share.mul(Rip.balanceOf(address(this))).div(totalShares);
        _burn(msg.sender, _share);
        Rip.transfer(msg.sender, what);
    }
}
