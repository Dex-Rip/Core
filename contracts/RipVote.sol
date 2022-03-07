// SPDX-License-Identifier: MIT
pragma solidity >0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IPair.sol";
import "./interfaces/IBar.sol";

interface IMasterChef {
    function userInfo(uint256 pid, address owner) external view returns (uint256, uint256);
}

contract RipVote {
    using SafeMath for uint256;

    IPair pair; // Rip-AVAX LP
    IBar bar;
    IERC20 Rip;
    IMasterChef chef;
    uint256 pid; // Pool ID of the Rip-AVAX LP in MasterChefV2

    function name() public pure returns (string memory) {
        return "RipVote";
    }

    function symbol() public pure returns (string memory) {
        return "RipVOTE";
    }

    function decimals() public pure returns (uint8) {
        return 18;
    }

    constructor(
        address _pair,
        address _bar,
        address _Rip,
        address _chef,
        uint256 _pid
    ) public {
        pair = IPair(_pair);
        bar = IBar(_bar);
        Rip = IERC20(_Rip);
        chef = IMasterChef(_chef);
        pid = _pid;
    }

    function totalSupply() public view returns (uint256) {
        (uint256 lp_totalRip, , ) = pair.getReserves();
        uint256 xRip_totalRip = Rip.balanceOf(address(bar));

        return lp_totalRip.mul(2).add(xRip_totalRip);
    }

    function balanceOf(address owner) public view returns (uint256) {
        //////////////////////////
        // Get balance from LPs //
        //////////////////////////
        uint256 lp_totalRip = Rip.balanceOf(address(pair));
        uint256 lp_total = pair.totalSupply();
        uint256 lp_balance = pair.balanceOf(owner);

        // Add staked balance
        (uint256 lp_stakedBalance, ) = chef.userInfo(pid, owner);
        lp_balance = lp_balance.add(lp_stakedBalance);

        // LP voting power is 2x the users Rip share in the pool.
        uint256 lp_powah = lp_totalRip.mul(lp_balance).div(lp_total).mul(2);

        ///////////////////////////
        // Get balance from xRip //
        ///////////////////////////

        uint256 xRip_balance = bar.balanceOf(owner);
        uint256 xRip_total = bar.totalSupply();
        uint256 xRip_totalRip = Rip.balanceOf(address(bar));

        // xRip voting power is the users Rip share in the bar
        uint256 xRip_powah = xRip_totalRip.mul(xRip_balance).div(xRip_total);

        //////////////////////////
        // Get balance from Rip //
        //////////////////////////

        uint256 Rip_balance = Rip.balanceOf(owner);

        return lp_powah.add(xRip_powah).add(Rip_balance);
    }

    function allowance(address, address) public pure returns (uint256) {
        return 0;
    }

    function transfer(address, uint256) public pure returns (bool) {
        return false;
    }

    function approve(address, uint256) public pure returns (bool) {
        return false;
    }

    function transferFrom(
        address,
        address,
        uint256
    ) public pure returns (bool) {
        return false;
    }
}
