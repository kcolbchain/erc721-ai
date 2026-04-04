import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    ...(process.env.SEPOLIA_RPC_URL
      ? {
          sepolia: {
            url: process.env.SEPOLIA_RPC_URL,
            accounts: process.env.DEPLOYER_PRIVATE_KEY
              ? [process.env.DEPLOYER_PRIVATE_KEY]
              : [],
          },
        }
      : {}),
  },
};

export default config;
