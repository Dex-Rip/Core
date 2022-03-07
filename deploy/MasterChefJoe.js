module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
  const { deploy } = deployments;

  const { deployer, dev, treasury } = await getNamedAccounts();

  const Rip = await ethers.getContract("RipToken");

  const { address } = await deploy("MasterChefRip", {
    from: deployer,
    args: [
      Rip.address,
      dev,
      treasury,
      "100000000000000000000",
      "1619065864",
      "200",
      "200",
    ],
    log: true,
    deterministicDeployment: false,
  });

  // if ((await Rip.owner()) !== address) {
  //   // Transfer Rip Ownership to Rip
  //   console.log("Transfer Rip Ownership to Rip");
  //   await (await Rip.transferOwnership(address)).wait();
  // }
};

module.exports.tags = ["MasterChefRip"];
module.exports.dependencies = ["RipFactory", "RipRouter02", "RipToken"];
