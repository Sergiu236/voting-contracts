require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.34",
  networks: {
    // The local node started with `npx hardhat node`
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
};
