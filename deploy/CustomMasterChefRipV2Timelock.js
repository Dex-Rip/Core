module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const chef = await ethers.getContract("MasterChefRipV2");

  const { address } = await deploy("CustomMasterChefRipV2Timelock", {
    from: deployer,
    args: [
      deployer,
      "43200", // 12 hours = 60*60*12 = 43200
      "200", // devPercent limit
      "200", // treasuryPercent limit
      "100", // investorPercent limit
      "40000000000000000000", // RipPerSec limit
    ],
    log: true,
    deterministicDeployment: false,
    gasLimit: 4000000,
  });

  // if ((await chef.owner()) !== address) {
  //   // Transfer MasterChefRipV2 Ownership to timelock
  //   console.log("Transfer MasterChefRipV2 Ownership to timelock");
  //   await (await chef.transferOwnership(address)).wait();
  // }
};

module.exports.tags = ["timelock"];
