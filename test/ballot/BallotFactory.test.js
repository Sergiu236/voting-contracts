const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BallotFactory", function () {
  let owner, registrar;
  let rbac, auditTrail, voterRegistry, candidateRegistry, ballotFactory;

  beforeEach(async function () {
    [owner, registrar] = await ethers.getSigners();

    // ── RBAC ──
    const Logic = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccess.sol:RoleBasedAccessLogicV1"
    );
    const logic = await Logic.deploy();
    await logic.waitForDeployment();

    const RBACProxy = await ethers.getContractFactory(
      "contracts/access/RoleBasedAccessProxy.sol:RoleBasedAccessProxy"
    );
    const rbacProxy = await RBACProxy.deploy(await logic.getAddress(), owner.address);
    await rbacProxy.waitForDeployment();

    rbac = await ethers.getContractAt(
      "contracts/access/IRoleBasedAccess.sol:IRoleBasedAccess",
      await rbacProxy.getAddress()
    );

    // ── Supporting contracts ──
    auditTrail = await (await ethers.getContractFactory("AuditTrail"))
      .deploy(await rbacProxy.getAddress());
    await auditTrail.waitForDeployment();

    voterRegistry = await (await ethers.getContractFactory("VoterRegistry"))
      .deploy(await rbacProxy.getAddress(), await auditTrail.getAddress());
    await voterRegistry.waitForDeployment();

    candidateRegistry = await (await ethers.getContractFactory("CandidateRegistry"))
      .deploy(await rbacProxy.getAddress(), await auditTrail.getAddress());
    await candidateRegistry.waitForDeployment();

    ballotFactory = await (await ethers.getContractFactory("BallotFactory")).deploy(
      await voterRegistry.getAddress(),
      await candidateRegistry.getAddress(),
      await rbacProxy.getAddress(),
      await auditTrail.getAddress()
    );
    await ballotFactory.waitForDeployment();

    const REGISTRAR = await rbac.REGISTRAR_ROLE();
    await rbac.assignRole(REGISTRAR, registrar.address);
  });

  // ── deployBallot ────────────────────────────────────────────────────────────

  it("deployBallot returns a non-zero address", async function () {
    const addr = await ballotFactory.deployBallot.staticCall(1, 0);
    expect(addr).to.not.equal(ethers.ZeroAddress);
  });

  it("deployBallot stores the ballot address retrievable via getBallot", async function () {
    await ballotFactory.deployBallot(1, 0);
    const stored = await ballotFactory.getBallot(1, 0);
    expect(stored).to.not.equal(ethers.ZeroAddress);
  });

  it("BallotDeployed event is emitted with correct electionId and shardId", async function () {
    await expect(ballotFactory.deployBallot(1, 0))
      .to.emit(ballotFactory, "BallotDeployed")
      .withArgs(1, 0, (addr) => addr !== ethers.ZeroAddress);
  });

  it("deploying the same (electionId, shardId) twice reverts with 'Ballot exists'", async function () {
    await ballotFactory.deployBallot(1, 0);
    await expect(
      ballotFactory.deployBallot(1, 0)
    ).to.be.revertedWith("Ballot exists");
  });

  it("different shardIds for same election each get distinct ballot addresses", async function () {
    await ballotFactory.deployBallot(1, 0);
    await ballotFactory.deployBallot(1, 1);
    const shard0 = await ballotFactory.getBallot(1, 0);
    const shard1 = await ballotFactory.getBallot(1, 1);
    expect(shard0).to.not.equal(shard1);
  });

  it("different electionIds get distinct ballot addresses", async function () {
    await ballotFactory.deployBallot(1, 0);
    await ballotFactory.deployBallot(2, 0);
    const ballot1 = await ballotFactory.getBallot(1, 0);
    const ballot2 = await ballotFactory.getBallot(2, 0);
    expect(ballot1).to.not.equal(ballot2);
  });

  // ── getShardCount ───────────────────────────────────────────────────────────

  it("getShardCount returns 0 before any ballot is deployed", async function () {
    expect(await ballotFactory.getShardCount(1)).to.equal(0);
  });

  it("getShardCount increments correctly as shards are deployed", async function () {
    await ballotFactory.deployBallot(1, 0);
    expect(await ballotFactory.getShardCount(1)).to.equal(1);
    await ballotFactory.deployBallot(1, 1);
    expect(await ballotFactory.getShardCount(1)).to.equal(2);
    await ballotFactory.deployBallot(1, 2);
    expect(await ballotFactory.getShardCount(1)).to.equal(3);
  });

  it("shard counts are independent across different elections", async function () {
    await ballotFactory.deployBallot(1, 0);
    await ballotFactory.deployBallot(1, 1);
    await ballotFactory.deployBallot(2, 0);
    expect(await ballotFactory.getShardCount(1)).to.equal(2);
    expect(await ballotFactory.getShardCount(2)).to.equal(1);
  });

  // ── Deployed ballot properties ──────────────────────────────────────────────

  it("deployed Ballot has the correct electionId", async function () {
    await ballotFactory.deployBallot(42, 0);
    const ballotAddr = await ballotFactory.getBallot(42, 0);
    const ballot = await ethers.getContractAt("Ballot", ballotAddr);
    expect(await ballot.electionId()).to.equal(42);
  });

  it("getBallot returns zero address for undeployed shard", async function () {
    expect(await ballotFactory.getBallot(99, 0)).to.equal(ethers.ZeroAddress);
  });
});
