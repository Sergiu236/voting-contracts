// scripts/deploy.js
// Run with: npx hardhat run scripts/deploy.js --network localhost
//
// Make sure `npx hardhat node` is already running in another terminal.

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // ✅ hardcode the RBAC admin you want
  const RBAC_ADMIN = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  console.log("RBAC admin will be     :", RBAC_ADMIN);
  console.log("─".repeat(60));

  // 1. deploy rbac logic + proxy (proxy calls initialize internally)
  const Logic = await hre.ethers.getContractFactory("RoleBasedAccessLogicV1");
  const logic = await Logic.deploy();
  await logic.waitForDeployment();
  console.log("RoleBasedAccessLogicV1 :", await logic.getAddress());

  const Proxy = await hre.ethers.getContractFactory("RoleBasedAccessProxy");
  // ✅ pass RBAC_ADMIN instead of deployer.address
  const proxy = await Proxy.deploy(await logic.getAddress(), RBAC_ADMIN);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("RoleBasedAccessProxy   :", proxyAddress);

  // 2. deploy audit trail (needs rbac proxy for role checks)
  const AuditTrail = await hre.ethers.getContractFactory("AuditTrail");
  const auditTrail = await AuditTrail.deploy(proxyAddress);
  await auditTrail.waitForDeployment();
  const auditTrailAddress = await auditTrail.getAddress();
  console.log("AuditTrail             :", auditTrailAddress);

  // 3. deploy voter registry (needs rbac proxy + audit trail)
  const VoterRegistry = await hre.ethers.getContractFactory("VoterRegistry");
  const voterRegistry = await VoterRegistry.deploy(proxyAddress, auditTrailAddress);
  await voterRegistry.waitForDeployment();
  const voterRegistryAddress = await voterRegistry.getAddress();
  console.log("VoterRegistry          :", voterRegistryAddress);

  // 4. deploy candidate registry (needs rbac proxy + audit trail)
  const CandidateRegistry = await hre.ethers.getContractFactory("CandidateRegistry");
  const candidateRegistry = await CandidateRegistry.deploy(proxyAddress, auditTrailAddress);
  await candidateRegistry.waitForDeployment();
  const candidateRegistryAddress = await candidateRegistry.getAddress();
  console.log("CandidateRegistry      :", candidateRegistryAddress);

  // 5. deploy tally verifier (mock, no dependencies)
  const TallyVerifier = await hre.ethers.getContractFactory("TallyVerifier");
  const tallyVerifier = await TallyVerifier.deploy();
  await tallyVerifier.waitForDeployment();
  const tallyVerifierAddress = await tallyVerifier.getAddress();
  console.log("TallyVerifier          :", tallyVerifierAddress);

  // 6. deploy ballot factory (needs voter/candidate registries, rbac, audit trail)
  const BallotFactory = await hre.ethers.getContractFactory("BallotFactory");
  const ballotFactory = await BallotFactory.deploy(
    voterRegistryAddress,
    candidateRegistryAddress,
    proxyAddress,
    auditTrailAddress
  );
  await ballotFactory.waitForDeployment();
  const ballotFactoryAddress = await ballotFactory.getAddress();
  console.log("BallotFactory          :", ballotFactoryAddress);

  // 7. deploy election manager (needs ballot factory, tally verifier, rbac proxy)
  const ElectionManager = await hre.ethers.getContractFactory("ElectionManager");
  const electionManager = await ElectionManager.deploy(
    ballotFactoryAddress,
    tallyVerifierAddress,
    proxyAddress
  );
  await electionManager.waitForDeployment();
  const electionManagerAddress = await electionManager.getAddress();
  console.log("ElectionManager        :", electionManagerAddress);

  // 8. deploy result aggregator (needs ballot factory, candidate registry, election manager)
  const ResultAggregator = await hre.ethers.getContractFactory("ResultAggregator");
  const resultAggregator = await ResultAggregator.deploy(
    ballotFactoryAddress,
    candidateRegistryAddress,
    electionManagerAddress
  );
  await resultAggregator.waitForDeployment();
  console.log("ResultAggregator       :", await resultAggregator.getAddress());

  // 9. wire election manager into ballot factory (one-time post-deploy link)
  const tx = await ballotFactory.setElectionManager(electionManagerAddress);
  await tx.wait();
  console.log("─".repeat(60));
  console.log("BallotFactory wired to ElectionManager");
  console.log("all contracts deployed successfully");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});