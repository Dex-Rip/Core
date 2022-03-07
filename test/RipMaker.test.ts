import { ethers, network } from "hardhat"
import { expect } from "chai"
import { prepare, deploy, getBigNumber, createSLP } from "./utilities"

describe("RipMaker", function () {
  before(async function () {
    await prepare(this, ["RipMaker", "RipBar", "RipMakerExploitMock", "ERC20Mock", "RipFactory", "RipPair"])
  })

  beforeEach(async function () {
    await deploy(this, [
      ["Rip", this.ERC20Mock, ["Rip", "Rip", getBigNumber("10000000")]],
      ["dai", this.ERC20Mock, ["DAI", "DAI", getBigNumber("10000000")]],
      ["mic", this.ERC20Mock, ["MIC", "MIC", getBigNumber("10000000")]],
      ["usdc", this.ERC20Mock, ["USDC", "USDC", getBigNumber("10000000")]],
      ["weth", this.ERC20Mock, ["WETH", "ETH", getBigNumber("10000000")]],
      ["strudel", this.ERC20Mock, ["$TRDL", "$TRDL", getBigNumber("10000000")]],
      ["factory", this.RipFactory, [this.alice.address]],
    ])
    await deploy(this, [["bar", this.RipBar, [this.Rip.address]]])
    await deploy(this, [["RipMaker", this.RipMaker, [this.factory.address, this.bar.address, this.Rip.address, this.weth.address]]])
    await deploy(this, [["exploiter", this.RipMakerExploitMock, [this.RipMaker.address]]])
    await createSLP(this, "RipEth", this.Rip, this.weth, getBigNumber(10))
    await createSLP(this, "strudelEth", this.strudel, this.weth, getBigNumber(10))
    await createSLP(this, "daiEth", this.dai, this.weth, getBigNumber(10))
    await createSLP(this, "usdcEth", this.usdc, this.weth, getBigNumber(10))
    await createSLP(this, "micUSDC", this.mic, this.usdc, getBigNumber(10))
    await createSLP(this, "RipUSDC", this.Rip, this.usdc, getBigNumber(10))
    await createSLP(this, "daiUSDC", this.dai, this.usdc, getBigNumber(10))
    await createSLP(this, "daiMIC", this.dai, this.mic, getBigNumber(10))
  })
  describe("setBridge", function () {
    it("does not allow to set bridge for Rip", async function () {
      await expect(this.RipMaker.setBridge(this.Rip.address, this.weth.address)).to.be.revertedWith("RipMaker: Invalid bridge")
    })

    it("does not allow to set bridge for WETH", async function () {
      await expect(this.RipMaker.setBridge(this.weth.address, this.Rip.address)).to.be.revertedWith("RipMaker: Invalid bridge")
    })

    it("does not allow to set bridge to itself", async function () {
      await expect(this.RipMaker.setBridge(this.dai.address, this.dai.address)).to.be.revertedWith("RipMaker: Invalid bridge")
    })

    it("emits correct event on bridge", async function () {
      await expect(this.RipMaker.setBridge(this.dai.address, this.Rip.address))
        .to.emit(this.RipMaker, "LogBridgeSet")
        .withArgs(this.dai.address, this.Rip.address)
    })
  })
  describe("convert", function () {
    it("should convert Rip - ETH", async function () {
      await this.RipEth.transfer(this.RipMaker.address, getBigNumber(1))
      await this.RipMaker.convert(this.Rip.address, this.weth.address)
      expect(await this.Rip.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.RipEth.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.Rip.balanceOf(this.bar.address)).to.equal("1897569270781234370")
    })

    it("should convert USDC - ETH", async function () {
      await this.usdcEth.transfer(this.RipMaker.address, getBigNumber(1))
      await this.RipMaker.convert(this.usdc.address, this.weth.address)
      expect(await this.Rip.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.usdcEth.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.Rip.balanceOf(this.bar.address)).to.equal("1590898251382934275")
    })

    it("should convert $TRDL - ETH", async function () {
      await this.strudelEth.transfer(this.RipMaker.address, getBigNumber(1))
      await this.RipMaker.convert(this.strudel.address, this.weth.address)
      expect(await this.Rip.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.strudelEth.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.Rip.balanceOf(this.bar.address)).to.equal("1590898251382934275")
    })

    it("should convert USDC - Rip", async function () {
      await this.RipUSDC.transfer(this.RipMaker.address, getBigNumber(1))
      await this.RipMaker.convert(this.usdc.address, this.Rip.address)
      expect(await this.Rip.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.RipUSDC.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.Rip.balanceOf(this.bar.address)).to.equal("1897569270781234370")
    })

    it("should convert using standard ETH path", async function () {
      await this.daiEth.transfer(this.RipMaker.address, getBigNumber(1))
      await this.RipMaker.convert(this.dai.address, this.weth.address)
      expect(await this.Rip.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.daiEth.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.Rip.balanceOf(this.bar.address)).to.equal("1590898251382934275")
    })

    it("converts MIC/USDC using more complex path", async function () {
      await this.micUSDC.transfer(this.RipMaker.address, getBigNumber(1))
      await this.RipMaker.setBridge(this.usdc.address, this.Rip.address)
      await this.RipMaker.setBridge(this.mic.address, this.usdc.address)
      await this.RipMaker.convert(this.mic.address, this.usdc.address)
      expect(await this.Rip.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.micUSDC.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.Rip.balanceOf(this.bar.address)).to.equal("1590898251382934275")
    })

    it("converts DAI/USDC using more complex path", async function () {
      await this.daiUSDC.transfer(this.RipMaker.address, getBigNumber(1))
      await this.RipMaker.setBridge(this.usdc.address, this.Rip.address)
      await this.RipMaker.setBridge(this.dai.address, this.usdc.address)
      await this.RipMaker.convert(this.dai.address, this.usdc.address)
      expect(await this.Rip.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.daiUSDC.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.Rip.balanceOf(this.bar.address)).to.equal("1590898251382934275")
    })

    it("converts DAI/MIC using two step path", async function () {
      await this.daiMIC.transfer(this.RipMaker.address, getBigNumber(1))
      await this.RipMaker.setBridge(this.dai.address, this.usdc.address)
      await this.RipMaker.setBridge(this.mic.address, this.dai.address)
      await this.RipMaker.convert(this.dai.address, this.mic.address)
      expect(await this.Rip.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.daiMIC.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.Rip.balanceOf(this.bar.address)).to.equal("1200963016721363748")
    })

    it("reverts if it loops back", async function () {
      await this.daiMIC.transfer(this.RipMaker.address, getBigNumber(1))
      await this.RipMaker.setBridge(this.dai.address, this.mic.address)
      await this.RipMaker.setBridge(this.mic.address, this.dai.address)
      await expect(this.RipMaker.convert(this.dai.address, this.mic.address)).to.be.reverted
    })

    it("reverts if caller is not EOA", async function () {
      await this.RipEth.transfer(this.RipMaker.address, getBigNumber(1))
      await expect(this.exploiter.convert(this.Rip.address, this.weth.address)).to.be.revertedWith("RipMaker: must use EOA")
    })

    it("reverts if pair does not exist", async function () {
      await expect(this.RipMaker.convert(this.mic.address, this.micUSDC.address)).to.be.revertedWith("RipMaker: Invalid pair")
    })

    it("reverts if no path is available", async function () {
      await this.micUSDC.transfer(this.RipMaker.address, getBigNumber(1))
      await expect(this.RipMaker.convert(this.mic.address, this.usdc.address)).to.be.revertedWith("RipMaker: Cannot convert")
      expect(await this.Rip.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.micUSDC.balanceOf(this.RipMaker.address)).to.equal(getBigNumber(1))
      expect(await this.Rip.balanceOf(this.bar.address)).to.equal(0)
    })
  })

  describe("convertMultiple", function () {
    it("should allow to convert multiple", async function () {
      await this.daiEth.transfer(this.RipMaker.address, getBigNumber(1))
      await this.RipEth.transfer(this.RipMaker.address, getBigNumber(1))
      await this.RipMaker.convertMultiple([this.dai.address, this.Rip.address], [this.weth.address, this.weth.address])
      expect(await this.Rip.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.daiEth.balanceOf(this.RipMaker.address)).to.equal(0)
      expect(await this.Rip.balanceOf(this.bar.address)).to.equal("3186583558687783097")
    })
  })

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    })
  })
})
