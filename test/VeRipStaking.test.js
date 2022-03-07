// @ts-nocheck
const { ethers, network, upgrades } = require("hardhat");
const { expect } = require("chai");
const { describe } = require("mocha");

describe("VeRip Staking", function () {
  before(async function () {
    this.VeRipStakingCF = await ethers.getContractFactory("VeRipStaking");
    this.VeRipTokenCF = await ethers.getContractFactory("VeRipToken");
    this.RipTokenCF = await ethers.getContractFactory("RipToken");

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.carol = this.signers[3];
  });

  beforeEach(async function () {
    this.veRip = await this.VeRipTokenCF.deploy();
    this.Rip = await this.RipTokenCF.deploy();

    await this.Rip.mint(this.alice.address, ethers.utils.parseEther("1000"));
    await this.Rip.mint(this.bob.address, ethers.utils.parseEther("1000"));
    await this.Rip.mint(this.carol.address, ethers.utils.parseEther("1000"));

    this.veRipPerSharePerSec = ethers.utils.parseEther("1");
    this.speedUpVeRipPerSharePerSec = ethers.utils.parseEther("1");
    this.speedUpThreshold = 5;
    this.speedUpDuration = 50;
    this.maxCapPct = 20000;

    this.veRipStaking = await upgrades.deployProxy(this.VeRipStakingCF, [
      this.Rip.address, // _Rip
      this.veRip.address, // _veRip
      this.veRipPerSharePerSec, // _veRipPerSharePerSec
      this.speedUpVeRipPerSharePerSec, // _speedUpVeRipPerSharePerSec
      this.speedUpThreshold, // _speedUpThreshold
      this.speedUpDuration, // _speedUpDuration
      this.maxCapPct, // _maxCapPct
    ]);
    await this.veRip.transferOwnership(this.veRipStaking.address);

    await this.Rip
      .connect(this.alice)
      .approve(this.veRipStaking.address, ethers.utils.parseEther("100000"));
    await this.Rip
      .connect(this.bob)
      .approve(this.veRipStaking.address, ethers.utils.parseEther("100000"));
    await this.Rip
      .connect(this.carol)
      .approve(this.veRipStaking.address, ethers.utils.parseEther("100000"));
  });

  describe("setMaxCapPct", function () {
    it("should not allow non-owner to setMaxCapPct", async function () {
      await expect(
        this.veRipStaking.connect(this.alice).setMaxCapPct(this.maxCapPct + 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should not allow owner to set lower maxCapPct", async function () {
      expect(await this.veRipStaking.maxCapPct()).to.be.equal(this.maxCapPct);

      await expect(
        this.veRipStaking.connect(this.dev).setMaxCapPct(this.maxCapPct - 1)
      ).to.be.revertedWith(
        "VeRipStaking: expected new _maxCapPct to be greater than existing maxCapPct"
      );
    });

    it("should not allow owner to set maxCapPct greater than upper limit", async function () {
      await expect(
        this.veRipStaking.connect(this.dev).setMaxCapPct(10000001)
      ).to.be.revertedWith(
        "VeRipStaking: expected new _maxCapPct to be non-zero and <= 10000000"
      );
    });

    it("should allow owner to setMaxCapPct", async function () {
      expect(await this.veRipStaking.maxCapPct()).to.be.equal(this.maxCapPct);

      await this.veRipStaking
        .connect(this.dev)
        .setMaxCapPct(this.maxCapPct + 100);

      expect(await this.veRipStaking.maxCapPct()).to.be.equal(
        this.maxCapPct + 100
      );
    });
  });

  describe("setVeRipPerSharePerSec", function () {
    it("should not allow non-owner to setVeRipPerSharePerSec", async function () {
      await expect(
        this.veRipStaking
          .connect(this.alice)
          .setVeRipPerSharePerSec(ethers.utils.parseEther("1.5"))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should not allow owner to set veRipPerSharePerSec greater than upper limit", async function () {
      await expect(
        this.veRipStaking
          .connect(this.dev)
          .setVeRipPerSharePerSec(ethers.utils.parseUnits("1", 37))
      ).to.be.revertedWith(
        "VeRipStaking: expected _veRipPerSharePerSec to be <= 1e36"
      );
    });

    it("should allow owner to setVeRipPerSharePerSec", async function () {
      expect(await this.veRipStaking.veRipPerSharePerSec()).to.be.equal(
        this.veRipPerSharePerSec
      );

      await this.veRipStaking
        .connect(this.dev)
        .setVeRipPerSharePerSec(ethers.utils.parseEther("1.5"));

      expect(await this.veRipStaking.veRipPerSharePerSec()).to.be.equal(
        ethers.utils.parseEther("1.5")
      );
    });
  });

  describe("setSpeedUpThreshold", function () {
    it("should not allow non-owner to setSpeedUpThreshold", async function () {
      await expect(
        this.veRipStaking.connect(this.alice).setSpeedUpThreshold(10)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should not allow owner to setSpeedUpThreshold to 0", async function () {
      await expect(
        this.veRipStaking.connect(this.dev).setSpeedUpThreshold(0)
      ).to.be.revertedWith(
        "VeRipStaking: expected _speedUpThreshold to be > 0 and <= 100"
      );
    });

    it("should not allow owner to setSpeedUpThreshold greater than 100", async function () {
      await expect(
        this.veRipStaking.connect(this.dev).setSpeedUpThreshold(101)
      ).to.be.revertedWith(
        "VeRipStaking: expected _speedUpThreshold to be > 0 and <= 100"
      );
    });

    it("should allow owner to setSpeedUpThreshold", async function () {
      expect(await this.veRipStaking.speedUpThreshold()).to.be.equal(
        this.speedUpThreshold
      );

      await this.veRipStaking.connect(this.dev).setSpeedUpThreshold(10);

      expect(await this.veRipStaking.speedUpThreshold()).to.be.equal(10);
    });
  });

  describe("deposit", function () {
    it("should not allow deposit 0", async function () {
      await expect(
        this.veRipStaking.connect(this.alice).deposit(0)
      ).to.be.revertedWith(
        "VeRipStaking: expected deposit amount to be greater than zero"
      );
    });

    it("should have correct updated user info after first time deposit", async function () {
      const beforeAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      // balance
      expect(beforeAliceUserInfo[0]).to.be.equal(0);
      // rewardDebt
      expect(beforeAliceUserInfo[1]).to.be.equal(0);
      // lastClaimTimestamp
      expect(beforeAliceUserInfo[2]).to.be.equal(0);
      // speedUpEndTimestamp
      expect(beforeAliceUserInfo[3]).to.be.equal(0);

      // Check Rip balance before deposit
      expect(await this.Rip.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("1000")
      );

      const depositAmount = ethers.utils.parseEther("100");
      await this.veRipStaking.connect(this.alice).deposit(depositAmount);
      const depositBlock = await ethers.provider.getBlock();

      // Check Rip balance after deposit
      expect(await this.Rip.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("900")
      );

      const afterAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      // balance
      expect(afterAliceUserInfo[0]).to.be.equal(depositAmount);
      // debtReward
      expect(afterAliceUserInfo[1]).to.be.equal(0);
      // lastClaimTimestamp
      expect(afterAliceUserInfo[2]).to.be.equal(depositBlock.timestamp);
      // speedUpEndTimestamp
      expect(afterAliceUserInfo[3]).to.be.equal(
        depositBlock.timestamp + this.speedUpDuration
      );
    });

    it("should have correct updated user balance after deposit with non-zero balance", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));

      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("5"));

      const afterAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      // balance
      expect(afterAliceUserInfo[0]).to.be.equal(ethers.utils.parseEther("105"));
    });

    it("should claim pending veRip upon depositing with non-zero balance", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));

      await increase(29);

      // Check veRip balance before deposit
      expect(await this.veRip.balanceOf(this.alice.address)).to.be.equal(0);

      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("1"));

      // Check veRip balance after deposit
      // Should have sum of:
      // baseVeRip =  100 * 30 = 3000 veRip
      // speedUpVeRip = 100 * 30 = 3000 veRip
      expect(await this.veRip.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("6000")
      );
    });

    it("should receive speed up benefits after depositing speedUpThreshold with non-zero balance", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));

      await increase(this.speedUpDuration);

      await this.veRipStaking.connect(this.alice).claim();

      const afterClaimAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      // speedUpTimestamp
      expect(afterClaimAliceUserInfo[3]).to.be.equal(0);

      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("5"));

      const secondDepositBlock = await ethers.provider.getBlock();

      const seconDepositAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      // speedUpTimestamp
      expect(seconDepositAliceUserInfo[3]).to.be.equal(
        secondDepositBlock.timestamp + this.speedUpDuration
      );
    });

    it("should not receive speed up benefits after depositing less than speedUpThreshold with non-zero balance", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));

      await increase(this.speedUpDuration);

      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("1"));

      const afterAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      // speedUpTimestamp
      expect(afterAliceUserInfo[3]).to.be.equal(0);
    });

    it("should receive speed up benefits after deposit with zero balance", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));

      await increase(100);

      await this.veRipStaking
        .connect(this.alice)
        .withdraw(ethers.utils.parseEther("100"));

      await increase(100);

      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("1"));

      const secondDepositBlock = await ethers.provider.getBlock();

      const secondDepositAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      // speedUpEndTimestamp
      expect(secondDepositAliceUserInfo[3]).to.be.equal(
        secondDepositBlock.timestamp + this.speedUpDuration
      );
    });

    it("should have speed up period extended after depositing speedUpThreshold and currently receiving speed up benefits", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));

      const initialDepositBlock = await ethers.provider.getBlock();

      const initialDepositAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      const initialDepositSpeedUpEndTimestamp = initialDepositAliceUserInfo[3];

      expect(initialDepositSpeedUpEndTimestamp).to.be.equal(
        initialDepositBlock.timestamp + this.speedUpDuration
      );

      // Increase by some amount of time less than speedUpDuration
      await increase(this.speedUpDuration / 2);

      // Deposit speedUpThreshold amount so that speed up period gets extended
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("5"));

      const secondDepositBlock = await ethers.provider.getBlock();

      const secondDepositAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      const secondDepositSpeedUpEndTimestamp = secondDepositAliceUserInfo[3];

      expect(
        secondDepositSpeedUpEndTimestamp.gt(initialDepositSpeedUpEndTimestamp)
      ).to.be.equal(true);
      expect(secondDepositSpeedUpEndTimestamp).to.be.equal(
        secondDepositBlock.timestamp + this.speedUpDuration
      );
    });

    it("should have lastClaimTimestamp updated after depositing if holding max veRip cap", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));

      // Increase by `maxCapPct` seconds to ensure that user will have max veRip
      // after claiming
      await increase(this.maxCapPct);

      await this.veRipStaking.connect(this.alice).claim();

      const claimBlock = await ethers.provider.getBlock();

      const claimAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      // lastClaimTimestamp
      expect(claimAliceUserInfo[2]).to.be.equal(claimBlock.timestamp);

      await increase(this.maxCapPct);

      const pendingVeRip = await this.veRipStaking.getPendingVeRip(
        this.alice.address
      );
      expect(pendingVeRip).to.be.equal(0);

      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("5"));

      const secondDepositBlock = await ethers.provider.getBlock();

      const secondDepositAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      // lastClaimTimestamp
      expect(secondDepositAliceUserInfo[2]).to.be.equal(
        secondDepositBlock.timestamp
      );
    });
  });

  describe("withdraw", function () {
    it("should not allow withdraw 0", async function () {
      await expect(
        this.veRipStaking.connect(this.alice).withdraw(0)
      ).to.be.revertedWith(
        "VeRipStaking: expected withdraw amount to be greater than zero"
      );
    });

    it("should not allow withdraw amount greater than user balance", async function () {
      await expect(
        this.veRipStaking.connect(this.alice).withdraw(1)
      ).to.be.revertedWith(
        "VeRipStaking: cannot withdraw greater amount of Rip than currently staked"
      );
    });

    it("should have correct updated user info and balances after withdraw", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));
      const depositBlock = await ethers.provider.getBlock();

      expect(await this.Rip.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("900")
      );

      await increase(this.speedUpDuration / 2);

      await this.veRipStaking.connect(this.alice).claim();
      const claimBlock = await ethers.provider.getBlock();

      expect(await this.veRip.balanceOf(this.alice.address)).to.not.be.equal(0);

      const beforeAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      // balance
      expect(beforeAliceUserInfo[0]).to.be.equal(
        ethers.utils.parseEther("100")
      );
      // rewardDebt
      expect(beforeAliceUserInfo[1]).to.be.equal(
        // Divide by 2 since half of it is from the speed up
        (await this.veRip.balanceOf(this.alice.address)).div(2)
      );
      // lastClaimTimestamp
      expect(beforeAliceUserInfo[2]).to.be.equal(claimBlock.timestamp);
      // speedUpEndTimestamp
      expect(beforeAliceUserInfo[3]).to.be.equal(
        depositBlock.timestamp + this.speedUpDuration
      );

      await this.veRipStaking
        .connect(this.alice)
        .withdraw(ethers.utils.parseEther("5"));
      const withdrawBlock = await ethers.provider.getBlock();

      // Check user info fields are updated correctly
      const afterAliceUserInfo = await this.veRipStaking.userInfos(
        this.alice.address
      );
      // balance
      expect(afterAliceUserInfo[0]).to.be.equal(ethers.utils.parseEther("95"));
      // rewardDebt
      expect(afterAliceUserInfo[1]).to.be.equal(
        (await this.veRipStaking.accVeRipPerShare()).mul(95)
      );
      // lastClaimTimestamp
      expect(afterAliceUserInfo[2]).to.be.equal(withdrawBlock.timestamp);
      // speedUpEndTimestamp
      expect(afterAliceUserInfo[3]).to.be.equal(0);

      // Check user token balances are updated correctly
      expect(await this.veRip.balanceOf(this.alice.address)).to.be.equal(0);
      expect(await this.Rip.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("905")
      );
    });
  });

  describe("claim", function () {
    it("should not be able to claim with zero balance", async function () {
      await expect(
        this.veRipStaking.connect(this.alice).claim()
      ).to.be.revertedWith(
        "VeRipStaking: cannot claim veRip when no Rip is staked"
      );
    });

    it("should update lastRewardTimestamp on claim", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));

      await increase(100);

      await this.veRipStaking.connect(this.alice).claim();
      const claimBlock = await ethers.provider.getBlock();

      // lastRewardTimestamp
      expect(await this.veRipStaking.lastRewardTimestamp()).to.be.equal(
        claimBlock.timestamp
      );
    });

    it("should receive veRip on claim", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));

      await increase(49);

      // Check veRip balance before claim
      expect(await this.veRip.balanceOf(this.alice.address)).to.be.equal(0);

      await this.veRipStaking.connect(this.alice).claim();

      // Check veRip balance after claim
      // Should be sum of:
      // baseVeRip = 100 * 50 = 5000
      // speedUpVeRip = 100 * 50 = 5000
      expect(await this.veRip.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("10000")
      );
    });

    it("should receive correct veRip if veRipPerSharePerSec is updated multiple times", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));

      await increase(9);

      await this.veRipStaking
        .connect(this.dev)
        .setVeRipPerSharePerSec(ethers.utils.parseEther("2"));

      await increase(9);

      await this.veRipStaking
        .connect(this.dev)
        .setVeRipPerSharePerSec(ethers.utils.parseEther("1.5"));

      await increase(9);

      // Check veRip balance before claim
      expect(await this.veRip.balanceOf(this.alice.address)).to.be.equal(0);

      await this.veRipStaking.connect(this.alice).claim();

      // Check veRip balance after claim
      // For baseVeRip, we're expected to have been generating at a rate of 1 for
      // the first 10 seconds, a rate of 2 for the next 10 seconds, and a rate of
      // 1.5 for the last 10 seconds, i.e.:
      // baseVeRip = 100 * 10 * 1 + 100 * 10 * 2 + 100 * 10 * 1.5 = 4500
      // speedUpVeRip = 100 * 30 = 3000
      expect(await this.veRip.balanceOf(this.alice.address)).to.be.equal(
        ethers.utils.parseEther("7500")
      );
    });
  });

  describe("updateRewardVars", function () {
    it("should have correct reward vars after time passes", async function () {
      await this.veRipStaking
        .connect(this.alice)
        .deposit(ethers.utils.parseEther("100"));

      const block = await ethers.provider.getBlock();
      await increase(29);

      const accVeRipPerShareBeforeUpdate =
        await this.veRipStaking.accVeRipPerShare();
      await this.veRipStaking.connect(this.dev).updateRewardVars();

      expect(await this.veRipStaking.lastRewardTimestamp()).to.be.equal(
        block.timestamp + 30
      );
      // Increase should be `secondsElapsed * veRipPerSharePerSec * ACC_VERip_PER_SHARE_PER_SEC_PRECISION`:
      // = 30 * 1 * 1e18
      expect(await this.veRipStaking.accVeRipPerShare()).to.be.equal(
        accVeRipPerShareBeforeUpdate.add(ethers.utils.parseEther("30"))
      );
    });
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});

const increase = (seconds) => {
  ethers.provider.send("evm_increaseTime", [seconds]);
  ethers.provider.send("evm_mine", []);
};
