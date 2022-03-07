import { ethers, network, upgrades } from "hardhat"
import { expect } from "chai"
import { ADDRESS_ZERO, advanceBlock, advanceBlockTo, latest, duration, increase } from "./utilities"

describe("BoostedMasterChefRip", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
    this.dev = this.signers[3]
    this.treasury = this.signers[4]
    this.investor = this.signers[5]
    this.minter = this.signers[6]

    this.MCV2 = await ethers.getContractFactory("MasterChefRipV2")
    this.BMC = await ethers.getContractFactory("BoostedMasterChefRip")

    this.RipToken = await ethers.getContractFactory("RipToken")
    this.VeRipToken = await ethers.getContractFactory("VeRipToken")
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter)
    this.SushiToken = await ethers.getContractFactory("SushiToken")

    this.devPercent = 200
    this.treasuryPercent = 200
    this.investorPercent = 100
    this.lpPercent = 1000 - this.devPercent - this.treasuryPercent - this.lpPercent
    this.RipPerSec = 100
    this.secOffset = 1
    this.tokenOffset = 1
  })

  beforeEach(async function () {
    this.Rip = await this.RipToken.deploy()
    await this.Rip.deployed()
    this.chef2 = await this.MCV2.deploy(
      this.Rip.address,
      this.dev.address,
      this.treasury.address,
      this.investor.address,
      this.RipPerSec,
      0,
      this.devPercent,
      this.treasuryPercent,
      this.investorPercent
    )
    await this.chef2.deployed()

    await this.Rip.transferOwnership(this.chef2.address)

    this.dummyToken = await this.ERC20Mock.connect(this.alice).deploy("Rip Dummy", "DUMMY", 1)
    this.veRip = await this.VeRipToken.connect(this.dev).deploy()
    await this.chef2.add(100, this.dummyToken.address, ADDRESS_ZERO)

    this.bmc = await upgrades.deployProxy(this.BMC, [this.chef2.address, this.Rip.address, this.veRip.address, 0])
    await this.bmc.deployed()

    await this.veRip.setBoostedMasterChefRip(this.bmc.address)
    await this.dummyToken.approve(this.bmc.address, 1)
    expect(this.bmc.init(this.dummyToken.address)).to.emit(this.bmc, "Init").withArgs(1)

    // TODO: Don't name this sushi.
    this.lp = await this.ERC20Mock.deploy("LPToken", "LP", 10000000000)
    await this.lp.deployed()

    await this.lp.transfer(this.alice.address, 1000)
    await this.lp.transfer(this.bob.address, 1000)
    await this.lp.transfer(this.carol.address, 1000)

    this.bmc.add(100, this.lp.address, ADDRESS_ZERO)
  })

  it("should revert if init called twice", async function () {
    await this.dummyToken.approve(this.bmc.address, 1)
    expect(this.bmc.init(this.dummyToken.address)).to.be.revertedWith("BoostedMasterChefRip: Already has a balance of dummy token")
  })

  it("should adjust boost balance when deposit", async function () {
    let pool
    // User has no veRip
    await this.lp.connect(this.alice).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.alice).deposit(0, 1000)
    pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(0)
    expect(pool.totalBoostedAmount).to.equal(1000)
    expect((await this.bmc.userInfo(0, this.alice.address)).veRipBalance).to.equal(0)

    // Transfer some veRip to bob
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)

    // Bob enters the pool
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.bob).deposit(0, 1000)
    pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(100)
    expect(pool.totalBoostedAmount).to.equal(3500)
    expect((await this.bmc.userInfo(0, this.bob.address)).veRipBalance).to.equal(100)
  })

  it("should adjust boost balance when deposit first", async function () {
    // Transfer some veRip to bob
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)

    // Bob enters the pool
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.bob).deposit(0, 1000)
    const pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(100)
    expect(pool.totalBoostedAmount).to.equal(2500)
    expect((await this.bmc.userInfo(0, this.bob.address)).veRipBalance).to.equal(100)
  })

  it("should adjust boost balance on second deposit", async function () {
    let pool
    // Transfer some veRip to bob
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)
    // Bob enters the pool
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.bob).deposit(0, 500)
    pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(100)
    expect(pool.totalBoostedAmount).to.equal(1250)
    expect((await this.bmc.userInfo(0, this.bob.address)).veRipBalance).to.equal(100)

    await this.bmc.connect(this.bob).deposit(0, 500)
    pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(100)
    expect(pool.totalBoostedAmount).to.equal(2500)
    expect((await this.bmc.userInfo(0, this.bob.address)).veRipBalance).to.equal(100)
  })

  it("should adjust boost balance when withdraw", async function () {
    await this.lp.connect(this.alice).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.alice).deposit(0, 1000)
    // Transfer some veRip to bob
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)
    // Bob enters the pool
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.bob).deposit(0, 1000)

    await this.bmc.connect(this.bob).withdraw(0, 1000)
    const pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(0)
    expect(pool.totalBoostedAmount).to.equal(1000)
  })

  it("should adjust boost balance when partial withdraw", async function () {
    await this.lp.connect(this.alice).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.alice).deposit(0, 1000)
    // Transfer some veRip to bob
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)
    // Bob enters the pool
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.bob).deposit(0, 1000)

    await this.bmc.connect(this.bob).withdraw(0, 500)
    const pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(100)
    expect(pool.totalBoostedAmount).to.equal(2250)
  })

  it("should return correct pending tokens according to boost", async function () {
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)
    // Disable automining so both users can deposit at the same time.
    await network.provider.send("evm_setAutomine", [false])

    await this.lp.connect(this.alice).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.alice).deposit(0, 1000)
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.bob).deposit(0, 1000)

    await advanceBlock()

    // Make sure contract has Rip to emit
    await this.bmc.connect(this.dev).harvestFromMasterChef()

    await increase(duration.hours(1))

    // bob should have 2.5x the pending tokens as alice.
    const alicePending = await this.bmc.pendingTokens(0, this.alice.address)
    const bobPending = await this.bmc.pendingTokens(0, this.bob.address)
    await expect(alicePending[0] * 2.5).to.be.closeTo(bobPending[0], 10)

    // Re-enable automining.
    await network.provider.send("evm_setAutomine", [true])
  })

  it("should record the correct reward debt on withdraw", async function () {
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)

    await this.bmc.connect(this.bob).deposit(0, 1000)
    await network.provider.send("evm_setAutomine", [false])
    // Make sure contract has Rip to emit
    await this.bmc.connect(this.dev).harvestFromMasterChef()
    await increase(duration.hours(1))

    await this.bmc.connect(this.bob).withdraw(0, 0)
    await increase(duration.seconds(1))

    const user = await this.bmc.userInfo(0, this.bob.address)
    expect(await this.Rip.balanceOf(this.bob.address)).to.equal(user.rewardDebt)

    await network.provider.send("evm_setAutomine", [true])
  })

  it("should claim reward on deposit", async function () {
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)

    await this.bmc.connect(this.bob).deposit(0, 500)
    await network.provider.send("evm_setAutomine", [false])
    // Make sure contract has Rip to emit
    await this.bmc.connect(this.dev).harvestFromMasterChef()
    await increase(duration.hours(1))

    await this.bmc.connect(this.bob).deposit(0, 500)

    await advanceBlock()

    const user = await this.bmc.userInfo(0, this.bob.address)
    // `mul(2)` is due to doubling the deposit.
    expect((await this.Rip.balanceOf(this.bob.address)).mul(2)).to.equal(user.rewardDebt)

    await network.provider.send("evm_setAutomine", [true])
  })

  it("should change rate when vRip mints", async function () {
    let pool
    await this.lp.connect(this.alice).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.alice).deposit(0, 1000)
    pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(0)
    expect(pool.totalBoostedAmount).to.equal(1000)
    expect((await this.bmc.userInfo(0, this.alice.address)).veRipBalance).to.equal(0)

    // Bob enters the pool
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.bob).deposit(0, 1000)
    pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(0)
    expect(pool.totalBoostedAmount).to.equal(2000)
    expect((await this.bmc.userInfo(0, this.bob.address)).veRipBalance).to.equal("0")

    // Mint some veRip to bob
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)
    pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(100)
    expect(pool.totalBoostedAmount).to.equal(3500)
    expect((await this.bmc.userInfo(0, this.bob.address)).veRipBalance).to.equal(100)
  })

  it("should change rate when vRip burns", async function () {
    let pool
    await this.lp.connect(this.alice).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.alice).deposit(0, 1000)
    pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(0)
    expect(pool.totalBoostedAmount).to.equal(1000)
    expect((await this.bmc.userInfo(0, this.alice.address)).veRipBalance).to.equal(0)

    // Bob enters the pool
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.bob).deposit(0, 1000)
    pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(100)
    expect(pool.totalBoostedAmount).to.equal(3500)
    expect((await this.bmc.userInfo(0, this.bob.address)).veRipBalance).to.equal(100)

    await this.veRip.connect(this.dev).burnFrom(this.bob.address, 100)

    pool = await this.bmc.poolInfo(0)
    expect(pool.totalVeRip).to.equal(0)
    expect(pool.totalBoostedAmount).to.equal(2000)
    expect((await this.bmc.userInfo(0, this.bob.address)).veRipBalance).to.equal("0")
  })

  it("should pay out rewards in claimable", async function () {
    // Bob enters the pool
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.bob).deposit(0, 1000)

    await increase(duration.hours(1))

    const pending = await this.bmc.pendingTokens(0, this.bob.address)
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)
    let claimable = await this.bmc.claimableRip(0, this.bob.address)
    // Close to as 1 second passes after the mint.
    expect(pending[0]).to.be.closeTo(claimable, 100)

    await this.bmc.connect(this.bob).withdraw(0, 0)
    expect(await this.bmc.claimableRip(0, this.bob.address)).to.equal(0)
    expect(await this.Rip.balanceOf(this.bob.address)).to.be.closeTo(pending[0], 100)
  })

  it("should stop boosting if burn veRip", async function () {
    // Bob enters the pool
    await this.veRip.connect(this.dev).mint(this.bob.address, 100)
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)
    await this.bmc.connect(this.bob).deposit(0, 1000)

    await increase(duration.hours(1))
    expect(await this.bmc.getBoostedLiquidity(0, this.bob.address)).to.equal(2500)

    await this.veRip.connect(this.dev).burnFrom(this.bob.address, 100)
    expect(await this.bmc.getBoostedLiquidity(0, this.bob.address)).to.equal(1000)

    let pending = await this.bmc.pendingTokens(0, this.bob.address)
    let claimable = await this.bmc.claimableRip(0, this.bob.address)
    // Close to as 1 second passes after the mint.
    expect(pending[0]).to.be.closeTo(claimable, 100)
  })

  it("should award rewards according to boosted liquidity", async function () {
    await network.provider.send("evm_setAutomine", [false])

    await this.veRip.connect(this.dev).mint(this.bob.address, 100)
    await this.lp.connect(this.bob).approve(this.bmc.address, 1000)
    await this.lp.connect(this.alice).approve(this.bmc.address, 1000)

    await this.bmc.connect(this.bob).deposit(0, 1000)
    await this.bmc.connect(this.alice).deposit(0, 1000)
    await advanceBlock()
    await increase(duration.hours(1))

    // We use `closeTo` here with 2 Wei to account for rounding errors.
    expect((await this.bmc.pendingTokens(0, this.bob.address))[0]).to.be.closeTo(
      (await this.bmc.pendingTokens(0, this.alice.address))[0].mul(25).div(10),
      2
    )
    await network.provider.send("evm_setAutomine", [true])
  })

  it("it should uptade the totalAllocPoint when calling set", async function () {
    await this.bmc.set(0, 1000, ADDRESS_ZERO, 0)
    expect(await this.bmc.totalAllocPoint()).to.equal(1000)
    expect((await this.bmc.poolInfo(0)).allocPoint).to.equal(1000)
  })

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    })
  })
})
