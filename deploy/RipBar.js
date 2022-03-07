module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const Rip = await deployments.get("RipToken");

  await deploy("RipBar", {
    from: deployer,
    args: [Rip.address],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["RipBar"];
module.exports.dependencies = ["RipFactory", "RipRouter02", "RipToken"];
