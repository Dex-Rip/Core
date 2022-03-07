module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
  const { deploy } = deployments;

  const { deployer, dev, treasury, investor } = await getNamedAccounts();

  const Rip = await ethers.getContract("RipToken");

  const { address } = await deploy("MasterChefRipV2", {
    from: deployer,
    args: [
      Rip.address,
      dev,
      treasury,
      investor,
      "30000000000000000000", // 30 Rip per sec
      "1625320800", // Sat Jul 03 10:00
      "200", // 20%
      "200", // 20%
      "100", // 10%
    ],
    log: true,
    deterministicDeployment: false,
  });

  if ((await Rip.owner()) !== address) {
    // Transfer Rip Ownership to MasterChefRipV2
    console.log("Transfer Rip Ownership to MasterChefRipV2");
    await (await Rip.transferOwnership(address)).wait();
  }
};

module.exports.tags = ["MasterChefRipV2", "chef"];
// module.exports.dependencies = ["RipFactory", "RipRouter02", "RipToken"];
