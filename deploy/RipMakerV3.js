const { WAVAX } = require("@DexRip-xyz/sdk");

module.exports = async function ({ ethers, getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const chainId = await getChainId();

  const factory = await ethers.getContract("RipFactory");
  const bar = await ethers.getContract("RipBar");
  const Rip = await ethers.getContract("RipToken");

  let wavaxAddress;

  if (chainId === "31337") {
    wavaxAddress = (await deployments.get("WAVAX9Mock")).address;
  } else if (chainId in WAVAX) {
    wavaxAddress = WAVAX[chainId].address;
  } else {
    throw Error("No WAVAX!");
  }

  await deploy("RipMakerV3", {
    from: deployer,
    args: [factory.address, bar.address, Rip.address, wavaxAddress],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["RipMakerV3"];
module.exports.dependencies = [
  "RipFactory",
  "RipRouter02",
  "RipBar",
  "RipToken",
];
