import { ethers, network } from "hardhat"
import { expect } from "chai"
import { encodeParameters, latest, duration, increase } from "./utilities"

describe("Timelock", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
    this.dev = this.signers[3]
    this.treasury = this.signers[4]
    this.investor = this.signers[5]
    this.minter = this.signers[6]

    this.RipToken = await ethers.getContractFactory("RipToken")
    this.Timelock = await ethers.getContractFactory("Timelock")
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter)
    this.MasterChef = await ethers.getContractFactory("MasterChefRip")
    this.MasterChefRipV2 = await ethers.getContractFactory("MasterChefRipV2")
    this.CustomMasterChefRipV2Timelock = await ethers.getContractFactory("CustomMasterChefRipV2Timelock")
  })

  beforeEach(async function () {
    this.Rip = await this.RipToken.deploy()
    this.timelock = await this.Timelock.deploy(this.bob.address, "259200")
    this.customTimelock = await this.CustomMasterChefRipV2Timelock.deploy(this.bob.address, "259200", "200", "200", "100", "100")
  })

  it("should not allow non-owner to do operation", async function () {
    await this.Rip.transferOwnership(this.timelock.address)
    // await expectRevert(this.Rip.transferOwnership(carol, { from: alice }), "Ownable: caller is not the owner")

    await expect(this.Rip.transferOwnership(this.carol.address)).to.be.revertedWith("Ownable: caller is not the owner")
    await expect(this.Rip.connect(this.bob).transferOwnership(this.carol.address)).to.be.revertedWith("Ownable: caller is not the owner")

    await expect(
      this.timelock.queueTransaction(
        this.Rip.address,
        "0",
        "transferOwnership(address)",
        encodeParameters(["address"], [this.carol.address]),
        (await latest()).add(duration.days(4))
      )
    ).to.be.revertedWith("Timelock::queueTransaction: Call must come from admin.")
  })

  it("should do the timelock thing", async function () {
    await this.Rip.transferOwnership(this.timelock.address)
    const eta = (await latest()).add(duration.days(4))
    await this.timelock
      .connect(this.bob)
      .queueTransaction(this.Rip.address, "0", "transferOwnership(address)", encodeParameters(["address"], [this.carol.address]), eta)
    await increase(duration.days(1))
    await expect(
      this.timelock
        .connect(this.bob)
        .executeTransaction(this.Rip.address, "0", "transferOwnership(address)", encodeParameters(["address"], [this.carol.address]), eta)
    ).to.be.revertedWith("Timelock::executeTransaction: Transaction hasn't surpassed time lock.")
    await increase(duration.days(4))
    await this.timelock
      .connect(this.bob)
      .executeTransaction(this.Rip.address, "0", "transferOwnership(address)", encodeParameters(["address"], [this.carol.address]), eta)
    expect(await this.Rip.owner()).to.equal(this.carol.address)
  })

  it("should also work with MasterChefRip", async function () {
    this.lp1 = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000")
    this.lp2 = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000")
    this.chef = await this.MasterChef.deploy(this.Rip.address, this.dev.address, this.treasury.address, "100", "0", "200", "200")
    await this.Rip.transferOwnership(this.chef.address)
    await this.chef.add("100", this.lp1.address)
    await this.chef.transferOwnership(this.timelock.address)
    const eta = (await latest()).add(duration.days(4))
    await this.timelock
      .connect(this.bob)
      .queueTransaction(this.chef.address, "0", "set(uint256,uint256)", encodeParameters(["uint256", "uint256"], ["0", "200"]), eta)
    await this.timelock
      .connect(this.bob)
      .queueTransaction(this.chef.address, "0", "add(uint256,address)", encodeParameters(["uint256", "address"], ["100", this.lp2.address]), eta)
    await increase(duration.days(4))
    await this.timelock
      .connect(this.bob)
      .executeTransaction(this.chef.address, "0", "set(uint256,uint256)", encodeParameters(["uint256", "uint256"], ["0", "200"]), eta)
    await this.timelock
      .connect(this.bob)
      .executeTransaction(
        this.chef.address,
        "0",
        "add(uint256,address)",
        encodeParameters(["uint256", "address"], ["100", this.lp2.address]),
        eta
      )
    expect((await this.chef.poolInfo("0")).allocPoint).to.equal("200")
    expect(await this.chef.totalAllocPoint()).to.equal("300")
    expect(await this.chef.poolLength()).to.equal("2")
  })

  it("should restrict changes above the limits with MasterChefRipV2", async function () {
    this.chef = await this.MasterChefRipV2.deploy(
      this.Rip.address,
      this.dev.address,
      this.treasury.address,
      this.investor.address,
      "100",
      "0",
      "200",
      "200",
      "100"
    )
    await this.chef.transferOwnership(this.customTimelock.address)
    const eta = (await latest()).add(duration.days(4))

    // Test setDevPercent
    await expect(
      this.customTimelock
        .connect(this.bob)
        .queueTransaction(this.chef.address, "0", "setDevPercent(uint256)", encodeParameters(["uint256"], ["201"]), eta)
    ).to.be.revertedWith("CustomMasterChefRipV2Timelock::withinLimits: devPercent must not exceed limit.")
    await this.customTimelock
      .connect(this.bob)
      .queueTransaction(this.chef.address, "0", "setDevPercent(uint256)", encodeParameters(["uint256"], ["199"]), eta)
    await increase(duration.days(4))
    await this.customTimelock
      .connect(this.bob)
      .executeTransaction(this.chef.address, "0", "setDevPercent(uint256)", encodeParameters(["uint256"], ["199"]), eta)
    expect(await this.chef.devPercent()).to.equal("199")

    // Test setTreasuryPercent
    const eta2 = (await latest()).add(duration.days(4))
    await expect(
      this.customTimelock
        .connect(this.bob)
        .queueTransaction(this.chef.address, "0", "setTreasuryPercent(uint256)", encodeParameters(["uint256"], ["201"]), eta2)
    ).to.be.revertedWith("CustomMasterChefRipV2Timelock::withinLimits: treasuryPercent must not exceed limit.")
    await this.customTimelock
      .connect(this.bob)
      .queueTransaction(this.chef.address, "0", "setTreasuryPercent(uint256)", encodeParameters(["uint256"], ["199"]), eta2)
    await increase(duration.days(4))
    await this.customTimelock
      .connect(this.bob)
      .executeTransaction(this.chef.address, "0", "setTreasuryPercent(uint256)", encodeParameters(["uint256"], ["199"]), eta2)
    expect(await this.chef.treasuryPercent()).to.equal("199")

    // Test setInvestorPercent
    const eta3 = (await latest()).add(duration.days(4))
    await expect(
      this.customTimelock
        .connect(this.bob)
        .queueTransaction(this.chef.address, "0", "setInvestorPercent(uint256)", encodeParameters(["uint256"], ["101"]), eta3)
    ).to.be.revertedWith("CustomMasterChefRipV2Timelock::withinLimits: investorPercent must not exceed limit.")
    await this.customTimelock
      .connect(this.bob)
      .queueTransaction(this.chef.address, "0", "setInvestorPercent(uint256)", encodeParameters(["uint256"], ["99"]), eta3)
    await increase(duration.days(4))
    await this.customTimelock
      .connect(this.bob)
      .executeTransaction(this.chef.address, "0", "setInvestorPercent(uint256)", encodeParameters(["uint256"], ["99"]), eta3)
    expect(await this.chef.investorPercent()).to.equal("99")

    // Test updateEmissionRate
    const eta4 = (await latest()).add(duration.days(4))
    await expect(
      this.customTimelock
        .connect(this.bob)
        .queueTransaction(this.chef.address, "0", "updateEmissionRate(uint256)", encodeParameters(["uint256"], ["101"]), eta4)
    ).to.be.revertedWith("CustomMasterChefRipV2Timelock::withinLimits: RipPerSec must not exceed limit.")
    await this.customTimelock
      .connect(this.bob)
      .queueTransaction(this.chef.address, "0", "updateEmissionRate(uint256)", encodeParameters(["uint256"], ["99"]), eta4)
    await increase(duration.days(4))
    await this.customTimelock
      .connect(this.bob)
      .executeTransaction(this.chef.address, "0", "updateEmissionRate(uint256)", encodeParameters(["uint256"], ["99"]), eta4)
    expect(await this.chef.RipPerSec()).to.equal("99")
  })

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    })
  })
})
