module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("Zap", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const zap = await ethers.getContract("Zap");
  const Rip = await deployments.get("RipToken");
  const router = await deployments.get("RipRouter02");
  await zap.initialize(Rip.address, router.address);
};

module.exports.tags = ["Zap"];
module.exports.dependencies = ["RipRouter02", "RipToken"];
