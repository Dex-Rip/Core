const Rip_AVAX_LP = new Map();
Rip_AVAX_LP.set("4", "0xab9ba8c7e7b00381027061a8506d895e8938060b");

module.exports = async function ({ ethers, getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const chainId = await getChainId();

  if (!Rip_AVAX_LP.has(chainId)) {
    throw Error("No Rip-AVAX LP");
  }

  const RipAvaxLpAddress = Rip_AVAX_LP.get(chainId);
  const bar = await ethers.getContract("RipBar");
  const Rip = await ethers.getContract("RipToken");
  const chef = await ethers.getContract("MasterChefRipV2");
  const pid = 0;

  await deploy("RipVote", {
    from: deployer,
    args: [RipAvaxLpAddress, bar.address, Rip.address, chef.address, pid],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["RipVote"];
module.exports.dependencies = ["RipBar", "RipToken", "MasterChefRipV2"];
