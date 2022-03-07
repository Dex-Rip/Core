module.exports = async function ({ ethers, getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer, dev } = await getNamedAccounts();

  const chainId = await getChainId();

  const Rip = await ethers.getContract("RipToken");

  await deploy("Cliff", {
    from: deployer,
    args: [Rip.address, dev, 0, 3],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["Cliff"];
module.exports.dependencies = ["RipToken"];
