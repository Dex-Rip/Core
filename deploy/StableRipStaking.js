module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  let rewardToken, RipAddress, feeCollector, depositFeePercent;

  const chainId = await getChainId();
  if (chainId == 4) {
    // rinkeby contract addresses
    RipAddress = "0xce347E069B68C53A9ED5e7DA5952529cAF8ACCd4";
    // fish token
    rewardToken = "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10";
    feeCollector = "0x2fbB61a10B96254900C03F1644E9e1d2f5E76DD2";
    depositFeePercent = 0;
  } else if (chainId == 43114 || chainId == 31337) {
    // avalanche mainnet or hardhat network addresses
    RipAddress = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";
    // USDC.e
    rewardToken = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";
    feeCollector = "0x2fbB61a10B96254900C03F1644E9e1d2f5E76DD2";
    depositFeePercent = 0;
  }

  const stableRipStaking = await deploy("StableRipStaking", {
    from: deployer,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [rewardToken, RipAddress, feeCollector, depositFeePercent],
        },
      },
    },
    log: true,
  });
};

module.exports.tags = ["StableRipStaking"];
module.exports.dependencies = [];
