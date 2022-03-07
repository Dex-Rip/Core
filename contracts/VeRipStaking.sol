// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./VeRipToken.sol";

/// @title Vote Escrow Rip Staking
/// @author Dex Rip
/// @notice Stake Rip to earn veRip, which you can use to earn higher farm yields and gain
/// voting power. Note that unstaking any amount of Rip will burn all of your existing veRip.
contract VeRipStaking is Initializable, OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Info for each user
    /// `balance`: Amount of Rip currently staked by user
    /// `rewardDebt`: The reward debt of the user
    /// `lastClaimTimestamp`: The timestamp of user's last claim or withdraw
    /// `speedUpEndTimestamp`: The timestamp when user stops receiving speed up benefits, or
    /// zero if user is not currently receiving speed up benefits
    struct UserInfo {
        uint256 balance;
        uint256 rewardDebt;
        uint256 lastClaimTimestamp;
        uint256 speedUpEndTimestamp;
        /**
         * @notice We do some fancy math here. Basically, any point in time, the amount of veRip
         * entitled to a user but is pending to be distributed is:
         *
         *   pendingReward = pendingBaseReward + pendingSpeedUpReward
         *
         *   pendingBaseReward = (user.balance * accVeRipPerShare) - user.rewardDebt
         *
         *   if user.speedUpEndTimestamp != 0:
         *     speedUpCeilingTimestamp = min(block.timestamp, user.speedUpEndTimestamp)
         *     speedUpSecondsElapsed = speedUpCeilingTimestamp - user.lastClaimTimestamp
         *     pendingSpeedUpReward = speedUpSecondsElapsed * user.balance * speedUpVeRipPerSharePerSec
         *   else:
         *     pendingSpeedUpReward = 0
         */
    }

    IERC20Upgradeable public Rip;
    VeRipToken public veRip;

    /// @notice The maximum limit of veRip user can have as percentage points of staked Rip
    /// For example, if user has `n` Rip staked, they can own a maximum of `n * maxCapPct / 100` veRip.
    uint256 public maxCapPct;

    /// @notice The upper limit of `maxCapPct`
    uint256 public upperLimitMaxCapPct;

    /// @notice The accrued veRip per share, scaled to `ACC_VERip_PER_SHARE_PRECISION`
    uint256 public accVeRipPerShare;

    /// @notice Precision of `accVeRipPerShare`
    uint256 public ACC_VERip_PER_SHARE_PRECISION;

    /// @notice The last time that the reward variables were updated
    uint256 public lastRewardTimestamp;

    /// @notice veRip per sec per Rip staked, scaled to `VERip_PER_SHARE_PER_SEC_PRECISION`
    uint256 public veRipPerSharePerSec;

    /// @notice Speed up veRip per sec per Rip staked, scaled to `VERip_PER_SHARE_PER_SEC_PRECISION`
    uint256 public speedUpVeRipPerSharePerSec;

    /// @notice The upper limit of `veRipPerSharePerSec` and `speedUpVeRipPerSharePerSec`
    uint256 public upperLimitVeRipPerSharePerSec;

    /// @notice Precision of `veRipPerSharePerSec`
    uint256 public VERip_PER_SHARE_PER_SEC_PRECISION;

    /// @notice Percentage of user's current staked Rip user has to deposit in order to start
    /// receiving speed up benefits, in parts per 100.
    /// @dev Specifically, user has to deposit at least `speedUpThreshold/100 * userStakedRip` Rip.
    /// The only exception is the user will also receive speed up benefits if they are depositing
    /// with zero balance
    uint256 public speedUpThreshold;

    /// @notice The length of time a user receives speed up benefits
    uint256 public speedUpDuration;

    mapping(address => UserInfo) public userInfos;

    event Claim(address indexed user, uint256 amount);
    event Deposit(address indexed user, uint256 amount);
    event UpdateMaxCapPct(address indexed user, uint256 maxCapPct);
    event UpdateRewardVars(uint256 lastRewardTimestamp, uint256 accVeRipPerShare);
    event UpdateSpeedUpThreshold(address indexed user, uint256 speedUpThreshold);
    event UpdateVeRipPerSharePerSec(address indexed user, uint256 veRipPerSharePerSec);
    event Withdraw(address indexed user, uint256 amount);

    /// @notice Initialize with needed parameters
    /// @param _Rip Address of the Rip token contract
    /// @param _veRip Address of the veRip token contract
    /// @param _veRipPerSharePerSec veRip per sec per Rip staked, scaled to `VERip_PER_SHARE_PER_SEC_PRECISION`
    /// @param _speedUpVeRipPerSharePerSec Similar to `_veRipPerSharePerSec` but for speed up
    /// @param _speedUpThreshold Percentage of total staked Rip user has to deposit receive speed up
    /// @param _speedUpDuration Length of time a user receives speed up benefits
    /// @param _maxCapPct Maximum limit of veRip user can have as percentage points of staked Rip
    function initialize(
        IERC20Upgradeable _Rip,
        VeRipToken _veRip,
        uint256 _veRipPerSharePerSec,
        uint256 _speedUpVeRipPerSharePerSec,
        uint256 _speedUpThreshold,
        uint256 _speedUpDuration,
        uint256 _maxCapPct
    ) public initializer {
        __Ownable_init();

        require(address(_Rip) != address(0), "VeRipStaking: unexpected zero address for _Rip");
        require(address(_veRip) != address(0), "VeRipStaking: unexpected zero address for _veRip");

        upperLimitVeRipPerSharePerSec = 1e36;
        require(
            _veRipPerSharePerSec <= upperLimitVeRipPerSharePerSec,
            "VeRipStaking: expected _veRipPerSharePerSec to be <= 1e36"
        );
        require(
            _speedUpVeRipPerSharePerSec <= upperLimitVeRipPerSharePerSec,
            "VeRipStaking: expected _speedUpVeRipPerSharePerSec to be <= 1e36"
        );

        require(
            _speedUpThreshold != 0 && _speedUpThreshold <= 100,
            "VeRipStaking: expected _speedUpThreshold to be > 0 and <= 100"
        );

        require(_speedUpDuration <= 365 days, "VeRipStaking: expected _speedUpDuration to be <= 365 days");

        upperLimitMaxCapPct = 10000000;
        require(
            _maxCapPct != 0 && _maxCapPct <= upperLimitMaxCapPct,
            "VeRipStaking: expected _maxCapPct to be non-zero and <= 10000000"
        );

        maxCapPct = _maxCapPct;
        speedUpThreshold = _speedUpThreshold;
        speedUpDuration = _speedUpDuration;
        Rip = _Rip;
        veRip = _veRip;
        veRipPerSharePerSec = _veRipPerSharePerSec;
        speedUpVeRipPerSharePerSec = _speedUpVeRipPerSharePerSec;
        lastRewardTimestamp = block.timestamp;
        ACC_VERip_PER_SHARE_PRECISION = 1e18;
        VERip_PER_SHARE_PER_SEC_PRECISION = 1e18;
    }

    /// @notice Set maxCapPct
    /// @param _maxCapPct The new maxCapPct
    function setMaxCapPct(uint256 _maxCapPct) external onlyOwner {
        require(_maxCapPct > maxCapPct, "VeRipStaking: expected new _maxCapPct to be greater than existing maxCapPct");
        require(
            _maxCapPct != 0 && _maxCapPct <= upperLimitMaxCapPct,
            "VeRipStaking: expected new _maxCapPct to be non-zero and <= 10000000"
        );
        maxCapPct = _maxCapPct;
        emit UpdateMaxCapPct(msg.sender, _maxCapPct);
    }

    /// @notice Set veRipPerSharePerSec
    /// @param _veRipPerSharePerSec The new veRipPerSharePerSec
    function setVeRipPerSharePerSec(uint256 _veRipPerSharePerSec) external onlyOwner {
        require(
            _veRipPerSharePerSec <= upperLimitVeRipPerSharePerSec,
            "VeRipStaking: expected _veRipPerSharePerSec to be <= 1e36"
        );
        updateRewardVars();
        veRipPerSharePerSec = _veRipPerSharePerSec;
        emit UpdateVeRipPerSharePerSec(msg.sender, _veRipPerSharePerSec);
    }

    /// @notice Set speedUpThreshold
    /// @param _speedUpThreshold The new speedUpThreshold
    function setSpeedUpThreshold(uint256 _speedUpThreshold) external onlyOwner {
        require(
            _speedUpThreshold != 0 && _speedUpThreshold <= 100,
            "VeRipStaking: expected _speedUpThreshold to be > 0 and <= 100"
        );
        speedUpThreshold = _speedUpThreshold;
        emit UpdateSpeedUpThreshold(msg.sender, _speedUpThreshold);
    }

    /// @notice Deposits Rip to start staking for veRip. Note that any pending veRip
    /// will also be claimed in the process.
    /// @param _amount The amount of Rip to deposit
    function deposit(uint256 _amount) external {
        require(_amount > 0, "VeRipStaking: expected deposit amount to be greater than zero");

        updateRewardVars();

        UserInfo storage userInfo = userInfos[msg.sender];

        if (_getUserHasNonZeroBalance(msg.sender)) {
            // Transfer to the user their pending veRip before updating their UserInfo
            _claim();

            // We need to update user's `lastClaimTimestamp` to now to prevent
            // passive veRip accrual if user hit their max cap.
            userInfo.lastClaimTimestamp = block.timestamp;

            uint256 userStakedRip = userInfo.balance;

            // User is eligible for speed up benefits if `_amount` is at least
            // `speedUpThreshold / 100 * userStakedRip`
            if (_amount.mul(100) >= speedUpThreshold.mul(userStakedRip)) {
                userInfo.speedUpEndTimestamp = block.timestamp.add(speedUpDuration);
            }
        } else {
            // If user is depositing with zero balance, they will automatically
            // receive speed up benefits
            userInfo.speedUpEndTimestamp = block.timestamp.add(speedUpDuration);
            userInfo.lastClaimTimestamp = block.timestamp;
        }

        userInfo.balance = userInfo.balance.add(_amount);
        userInfo.rewardDebt = accVeRipPerShare.mul(userInfo.balance).div(ACC_VERip_PER_SHARE_PRECISION);

        Rip.safeTransferFrom(msg.sender, address(this), _amount);

        emit Deposit(msg.sender, _amount);
    }

    /// @notice Withdraw staked Rip. Note that unstaking any amount of Rip means you will
    /// lose all of your current veRip.
    /// @param _amount The amount of Rip to unstake
    function withdraw(uint256 _amount) external {
        require(_amount > 0, "VeRipStaking: expected withdraw amount to be greater than zero");

        UserInfo storage userInfo = userInfos[msg.sender];

        require(
            userInfo.balance >= _amount,
            "VeRipStaking: cannot withdraw greater amount of Rip than currently staked"
        );
        updateRewardVars();

        // Note that we don't need to claim as the user's veRip balance will be reset to 0
        userInfo.balance = userInfo.balance.sub(_amount);
        userInfo.rewardDebt = accVeRipPerShare.mul(userInfo.balance).div(ACC_VERip_PER_SHARE_PRECISION);
        userInfo.lastClaimTimestamp = block.timestamp;
        userInfo.speedUpEndTimestamp = 0;

        // Burn the user's current veRip balance
        veRip.burnFrom(msg.sender, veRip.balanceOf(msg.sender));

        // Send user their requested amount of staked Rip
        Rip.safeTransfer(msg.sender, _amount);

        emit Withdraw(msg.sender, _amount);
    }

    /// @notice Claim any pending veRip
    function claim() external {
        require(_getUserHasNonZeroBalance(msg.sender), "VeRipStaking: cannot claim veRip when no Rip is staked");
        updateRewardVars();
        _claim();
    }

    /// @notice Get the pending amount of veRip for a given user
    /// @param _user The user to lookup
    /// @return The number of pending veRip tokens for `_user`
    function getPendingVeRip(address _user) public view returns (uint256) {
        if (!_getUserHasNonZeroBalance(_user)) {
            return 0;
        }

        UserInfo memory user = userInfos[_user];

        // Calculate amount of pending base veRip
        uint256 _accVeRipPerShare = accVeRipPerShare;
        uint256 secondsElapsed = block.timestamp.sub(lastRewardTimestamp);
        if (secondsElapsed > 0) {
            _accVeRipPerShare = _accVeRipPerShare.add(
                secondsElapsed.mul(veRipPerSharePerSec).mul(ACC_VERip_PER_SHARE_PRECISION).div(
                    VERip_PER_SHARE_PER_SEC_PRECISION
                )
            );
        }
        uint256 pendingBaseVeRip = _accVeRipPerShare.mul(user.balance).div(ACC_VERip_PER_SHARE_PRECISION).sub(
            user.rewardDebt
        );

        // Calculate amount of pending speed up veRip
        uint256 pendingSpeedUpVeRip;
        if (user.speedUpEndTimestamp != 0) {
            uint256 speedUpCeilingTimestamp = block.timestamp > user.speedUpEndTimestamp
                ? user.speedUpEndTimestamp
                : block.timestamp;
            uint256 speedUpSecondsElapsed = speedUpCeilingTimestamp.sub(user.lastClaimTimestamp);
            uint256 speedUpAccVeRipPerShare = speedUpSecondsElapsed.mul(speedUpVeRipPerSharePerSec);
            pendingSpeedUpVeRip = speedUpAccVeRipPerShare.mul(user.balance).div(VERip_PER_SHARE_PER_SEC_PRECISION);
        }

        uint256 pendingVeRip = pendingBaseVeRip.add(pendingSpeedUpVeRip);

        // Get the user's current veRip balance
        uint256 userVeRipBalance = veRip.balanceOf(_user);

        // This is the user's max veRip cap multiplied by 100
        uint256 scaledUserMaxVeRipCap = user.balance.mul(maxCapPct);

        if (userVeRipBalance.mul(100) >= scaledUserMaxVeRipCap) {
            // User already holds maximum amount of veRip so there is no pending veRip
            return 0;
        } else if (userVeRipBalance.add(pendingVeRip).mul(100) > scaledUserMaxVeRipCap) {
            return scaledUserMaxVeRipCap.sub(userVeRipBalance.mul(100)).div(100);
        } else {
            return pendingVeRip;
        }
    }

    /// @notice Update reward variables
    function updateRewardVars() public {
        if (block.timestamp <= lastRewardTimestamp) {
            return;
        }

        if (Rip.balanceOf(address(this)) == 0) {
            lastRewardTimestamp = block.timestamp;
            return;
        }

        uint256 secondsElapsed = block.timestamp.sub(lastRewardTimestamp);
        accVeRipPerShare = accVeRipPerShare.add(
            secondsElapsed.mul(veRipPerSharePerSec).mul(ACC_VERip_PER_SHARE_PRECISION).div(
                VERip_PER_SHARE_PER_SEC_PRECISION
            )
        );
        lastRewardTimestamp = block.timestamp;

        emit UpdateRewardVars(lastRewardTimestamp, accVeRipPerShare);
    }

    /// @notice Checks to see if a given user currently has staked Rip
    /// @param _user The user address to check
    /// @return Whether `_user` currently has staked Rip
    function _getUserHasNonZeroBalance(address _user) private view returns (bool) {
        return userInfos[_user].balance > 0;
    }

    /// @dev Helper to claim any pending veRip
    function _claim() private {
        uint256 veRipToClaim = getPendingVeRip(msg.sender);

        UserInfo storage userInfo = userInfos[msg.sender];

        userInfo.rewardDebt = accVeRipPerShare.mul(userInfo.balance).div(ACC_VERip_PER_SHARE_PRECISION);

        // If user's speed up period has ended, reset `speedUpEndTimestamp` to 0
        if (userInfo.speedUpEndTimestamp != 0 && block.timestamp >= userInfo.speedUpEndTimestamp) {
            userInfo.speedUpEndTimestamp = 0;
        }

        if (veRipToClaim > 0) {
            userInfo.lastClaimTimestamp = block.timestamp;

            veRip.mint(msg.sender, veRipToClaim);
            emit Claim(msg.sender, veRipToClaim);
        }
    }
}
